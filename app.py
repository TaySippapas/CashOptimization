"""FastAPI entry point for the KTB Cash Route Optimization Databricks App.

Reads operational data from Unity Catalog via the attached SQL warehouse when
`USE_UNITY_CATALOG=true` (see config.yaml / app.yaml). Falls back to in-process
mock generators if UC is disabled or a query fails.
"""
from __future__ import annotations

import logging
import os
import threading
from typing import Any

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from server.mock import build_plan
from server.router_v2 import router as router_v2  # ktb_cash_route.ops dim/fact API, see DATABRICKS_NEW_PIPELINE_PROCEDURE.md
from server.settings import get_settings

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ktb-app")

app = FastAPI(title="KTB Cash Route Optimization")
app.include_router(router_v2)


@app.on_event("startup")
def _warm_uc_pool() -> None:
    """Open warehouse connections in the background so the first page load
    doesn't wait on handshakes. Runs off-thread: startup must not block, and a
    sleeping warehouse would otherwise stall boot."""
    if not _uc_enabled():
        return

    def run() -> None:
        try:
            from server.uc_repo_v2 import warm_pool

            warm_pool()
            log.info("UC connection pool warmed")
        except Exception:
            log.warning("UC pool warm-up skipped", exc_info=True)

    threading.Thread(target=run, name="uc-pool-warmup", daemon=True).start()


@app.on_event("shutdown")
def _close_uc_pool() -> None:
    """Close pooled warehouse connections instead of leaving them to the GC."""
    try:
        from server.uc_repo_v2 import close_pool

        close_pool()
    except Exception:
        log.exception("Failed closing the UC connection pool")


def _uc_enabled() -> bool:
    s = get_settings()
    return bool(s.use_unity_catalog and s.warehouse_id and s.catalog and s.schema)


def _resolved_business_date() -> str:
    s = get_settings()
    if not _uc_enabled():
        return s.business_date
    try:
        from server.uc_repo import connection_info

        return str(connection_info().get("businessDate") or s.business_date)
    except Exception:
        log.exception("Failed resolving business date")
        return s.business_date


@app.get("/api/health")
def health():
    s = get_settings()
    return {
        "status": "ok",
        "useUnityCatalog": _uc_enabled(),
        "catalog": s.catalog,
        "schema": s.schema,
        "warehouseId": s.warehouse_id,
        "businessDate": _resolved_business_date(),
        "businessDateMode": s.business_date,
    }


@app.get("/api/config")
def api_config():
    from server.uc_repo import connection_info

    return connection_info()


@app.get("/api/plan")
def plan():
    if _uc_enabled():
        try:
            from server.uc_repo import fetch_plan_bundle

            return fetch_plan_bundle()
        except Exception:
            log.exception("UC /api/plan failed; falling back to mock")
    return build_plan()


@app.get("/api/machines")
def machines():
    if _uc_enabled():
        try:
            from server.uc_repo import fetch_machines

            data = fetch_machines()
            return {"source": "unity_catalog", "businessDate": _resolved_business_date(), "machines": data}
        except Exception as e:
            log.exception("UC /api/machines failed")
            return {"source": "error", "error": str(e), "machines": []}
    return {"source": "mock", "machines": []}


@app.get("/api/branches")
def branches():
    if _uc_enabled():
        try:
            from server.uc_repo import fetch_branches

            data = fetch_branches()
            return {"source": "unity_catalog", "businessDate": _resolved_business_date(), "branches": data}
        except Exception as e:
            log.exception("UC /api/branches failed")
            return {"source": "error", "error": str(e), "branches": []}
    return {"source": "mock", "branches": []}


@app.get("/api/branch-inputs")
def branch_inputs():
    """BranchInput[] including depot — for Configure Inputs."""
    if _uc_enabled():
        try:
            from server.uc_repo import fetch_branch_inputs_for_config

            data = fetch_branch_inputs_for_config()
            return {"source": "unity_catalog", "branches": data}
        except Exception as e:
            log.exception("UC /api/branch-inputs failed")
            return {"source": "error", "error": str(e), "branches": []}
    return {"source": "mock", "branches": []}


@app.get("/api/routes")
def routes(plan_type: str | None = Query(default=None)):
    if _uc_enabled():
        try:
            from server.uc_repo import fetch_routes

            data = fetch_routes(plan_type)
            return {"source": "unity_catalog", "businessDate": _resolved_business_date(), "routes": data}
        except Exception as e:
            log.exception("UC /api/routes failed")
            return {"source": "error", "error": str(e), "routes": []}
    return {"source": "mock", "routes": []}


FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend", "dist")

if os.path.isdir(FRONTEND_DIR):
    assets_dir = os.path.join(FRONTEND_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    _NO_CACHE = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Surrogate-Control": "no-store",
    }

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # index.html must never be cached — ensures new deploys are picked up immediately
        if not full_path or full_path == "index.html":
            return FileResponse(os.path.join(FRONTEND_DIR, "index.html"), headers=_NO_CACHE)
        candidate = os.path.join(FRONTEND_DIR, full_path)
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        # SPA fallback: all unknown routes serve index.html (React Router handles them)
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"), headers=_NO_CACHE)
