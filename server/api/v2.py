"""New /api/v2 query API over the ktb_cash_route.ops dim/fact schema.

Separate FastAPI router, mounted onto the existing `app` in app.py — kept
apart from the /api/* routes in app.py so the two pipelines don't collide.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from server.repositories import branches, cash_flow, fleet, health, machines, overview, routes, trends
from server.schemas.v2 import (
    Branch,
    Machine,
    CashFlowPoint,
    DenominationGap,
    Route,
    TruckAvailabilityUpdate,
    RouteParamUpdate,
)
from server import warehouse

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v2", tags=["v2"])


@router.get("/health")
def get_health():
    try:
        # Counters are merged here rather than inside health.health(): that is
        # @cached, so counters returned from it would be frozen for the cache
        # TTL and every poll would report the same stale numbers.
        return {**health.health(), "pool": warehouse.pool_stats()}
    except Exception as e:
        log.exception("v2 /health failed")
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/date-range")
def get_date_range(dataset: Literal["branches", "machines", "routes"] = Query(default="branches")):
    try:
        return {"source": "unity_catalog", **health.fetch_date_range(dataset)}
    except Exception as e:
        log.exception("v2 /date-range failed")
        raise HTTPException(status_code=503, detail="Unable to load available dates")


@router.get("/reports/available-dates")
def get_report_dates():
    try:
        return {"dates": routes.fetch_report_dates()}
    except Exception:
        log.exception("v2 /reports/available-dates failed")
        raise HTTPException(status_code=503, detail="Unable to load report dates")


@router.get("/trends/{dataset}")
def get_trends(
    dataset: Literal["branches", "machines", "routes"],
    period: Literal["3days", "week", "month", "quarter", "year"] = "week",
    end: date | None = None,
):
    try:
        return trends.fetch_trends(dataset, period, end.isoformat() if end else None)
    except Exception:
        log.exception("v2 trends failed")
        raise HTTPException(status_code=503, detail="Unable to load trends. Please retry.")


@router.get("/branches", response_model=list[Branch])
def get_branches(date_: str | None = Query(default=None, alias="date")):
    try:
        return branches.fetch_branches(date_)
    except Exception as e:
        log.exception("v2 /branches failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines", response_model=list[Machine])
def get_machines(date_: str | None = Query(default=None, alias="date")):
    try:
        return machines.fetch_machines(date_)
    except Exception as e:
        log.exception("v2 /machines failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/branches/{branch_code}/cash-flow", response_model=list[CashFlowPoint])
def get_branch_cash_flow(branch_code: str, date_: str | None = Query(default=None, alias="date")):
    try:
        return cash_flow.fetch_cash_flow("BRANCH", branch_code, date_)
    except Exception as e:
        log.exception("v2 /branches/{code}/cash-flow failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/cash-flow", response_model=list[CashFlowPoint])
def get_machine_cash_flow(machine_id: str, date_: str | None = Query(default=None, alias="date")):
    try:
        return cash_flow.fetch_cash_flow("MACHINE", machine_id, date_)
    except Exception as e:
        log.exception("v2 /machines/{id}/cash-flow failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/branches/{branch_code}/denomination-gap", response_model=list[DenominationGap])
def get_branch_denomination_gap(branch_code: str, date_: str | None = Query(default=None, alias="date")):
    try:
        return cash_flow.fetch_denomination_gap("BRANCH", branch_code, date_)
    except Exception as e:
        log.exception("v2 /branches/{code}/denomination-gap failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/denomination-gap", response_model=list[DenominationGap])
def get_machine_denomination_gap(machine_id: str, date_: str | None = Query(default=None, alias="date")):
    try:
        return cash_flow.fetch_denomination_gap("MACHINE", machine_id, date_)
    except Exception as e:
        log.exception("v2 /machines/{id}/denomination-gap failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/routes", response_model=list[Route])
def get_routes(date_: str | None = Query(default=None, alias="date"), plan_type: str | None = Query(default=None)):
    try:
        return routes.fetch_routes(date_, plan_type)
    except Exception as e:
        log.exception("v2 /routes failed")
        raise HTTPException(status_code=500, detail=str(e))


# ── Frontend-shaped endpoints ─────────────────────────────────────────────
# Same response envelope as the old /api/* endpoints in app.py
# ({source, businessDate, <key>}) so frontend/src/api/backend.ts only needs
# its URLs changed, not its parsing logic.


@router.get("/branch-tracks")
def get_branch_tracks(date_: str | None = Query(default=None, alias="date")):
    try:
        resolved_date, data = branches.fetch_branch_tracks(date_)
        return {"source": "unity_catalog", "businessDate": resolved_date, "branches": data}
    except Exception as e:
        log.exception("v2 /branch-tracks failed")
        return {"source": "error", "error": str(e), "branches": []}


@router.get("/branch-inputs")
def get_branch_inputs(date_: str | None = Query(default=None, alias="date")):
    try:
        data = branches.fetch_branch_inputs(date_)
        return {"source": "unity_catalog", "branches": data}
    except Exception as e:
        log.exception("v2 /branch-inputs failed")
        return {"source": "error", "error": str(e), "branches": []}


@router.get("/machine-tracks")
def get_machine_tracks(date_: str | None = Query(default=None, alias="date")):
    try:
        resolved_date, data = machines.fetch_machine_tracks(date_)
        return {"source": "unity_catalog", "businessDate": resolved_date, "machines": data}
    except Exception as e:
        log.exception("v2 /machine-tracks failed")
        return {"source": "error", "error": str(e), "machines": []}


@router.get("/route-executions")
def get_route_executions(date_: str | None = Query(default=None, alias="date"), plan_type: str | None = Query(default=None)):
    try:
        resolved_date, data = routes.fetch_route_executions(date_, plan_type)
        return {"source": "unity_catalog", "businessDate": resolved_date, "routes": data}
    except Exception as e:
        log.exception("v2 /route-executions failed")
        return {"source": "error", "error": str(e), "routes": []}


# ── Fleet config ──────────────────────────────────────────────────────────

@router.get("/fleet")
def get_fleet():
    try:
        data = fleet.fetch_fleet()
        log.info("v2 /fleet OK: %d trucks", len(data))
        return {"source": "unity_catalog", "trucks": data}
    except Exception as e:
        log.exception("v2 /fleet failed")
        return {"source": "error", "error": str(e), "errorType": type(e).__name__, "trucks": []}


@router.post("/fleet/availability")
def post_fleet_availability(body: TruckAvailabilityUpdate):
    try:
        fleet.update_truck_availability(body.truckId, body.isAvailable)
        return {"ok": True, "truckId": body.truckId, "isAvailable": body.isAvailable}
    except Exception as e:
        log.exception("v2 /fleet/availability failed")
        raise HTTPException(status_code=500, detail=str(e))


# ── Route parameters config ───────────────────────────────────────────────

@router.get("/route-params")
def get_route_params():
    try:
        data = fleet.fetch_route_params()
        log.info("v2 /route-params OK: %d params", len(data))
        return {"source": "unity_catalog", "params": data}
    except Exception as e:
        log.exception("v2 /route-params failed")
        return {"source": "error", "error": str(e), "errorType": type(e).__name__, "params": []}


@router.post("/route-params")
def post_route_param(body: RouteParamUpdate):
    try:
        fleet.update_route_param(body.parameter, body.value)
        return {"ok": True, "parameter": body.parameter, "value": body.value}
    except Exception as e:
        log.exception("v2 /route-params update failed")
        raise HTTPException(status_code=500, detail=str(e))


# ── Overview Summary (Demand vs Plan) ─────────────────────────────

@router.get("/overview-summary")
def get_overview_summary(
    date_: str | None = Query(default=None, alias="date"),
    period: str = Query(default="day", pattern="^(day|week|month|quarter|year)$"),
):
    try:
        data = overview.fetch_overview_summary(date_, period)
        log.info("v2 /overview-summary OK")
        return {"source": "unity_catalog", **data}
    except Exception as e:
        log.exception("v2 /overview-summary failed")
        return {"source": "error", "error": str(e), "errorType": type(e).__name__}
