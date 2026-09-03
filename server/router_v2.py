"""New /api/v2 query API over the ktb_cash_route.ops dim/fact schema.

Separate FastAPI router, mounted onto the existing `app` in app.py — kept
apart from the /api/* routes in app.py so the two pipelines don't collide.
"""
from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from server import uc_repo_v2 as repo

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v2", tags=["v2"])


class Branch(BaseModel):
    branch_code: str
    branch_name: str | None = None
    district_name: str | None = None
    region_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    is_depot: bool | None = None
    cash_capacity_thb: float | None = None
    min_threshold_thb: float | None = None
    opening_cash_thb: float | None = None
    predicted_cash_thb: float | None = None
    predicted_inflow_thb: float | None = None
    predicted_outflow_thb: float | None = None
    action_type: str | None = None
    health_status: str | None = None
    emergency_flag: bool | None = None


class Machine(BaseModel):
    machine_id: str
    machine_type: str | None = None
    location_name: str | None = None
    region_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    alltime_max_cash_thb: float | None = None
    opening_cash_thb: float | None = None
    predicted_cash_thb: float | None = None
    predicted_inflow_thb: float | None = None
    predicted_outflow_thb: float | None = None
    action_type: str | None = None
    health_status: str | None = None


class CashFlowPoint(BaseModel):
    series_date: date
    value_type: str
    deposit_amount_thb: float | None = None
    withdrawal_amount_thb: float | None = None
    net_amount_thb: float | None = None
    remaining_amount_thb: float | None = None


class DenominationGap(BaseModel):
    denomination_thb: int
    predicted_note_count: int | None = None
    predicted_amount_thb: float | None = None
    predicted_mix_pct: float | None = None
    actual_note_count: int | None = None
    actual_mix_pct: float | None = None
    gap_note_count: int | None = None
    gap_amount_thb: float | None = None


class RouteStop(BaseModel):
    stop_sequence: int
    stop_code: str | None = None
    stop_name: str | None = None
    stop_type: str | None = None
    stop_status: str | None = None
    eta: str | None = None
    amount_thb: float | None = None
    latitude: float | None = None
    longitude: float | None = None
    leg_km: float | None = None
    cumulative_km: float | None = None


class Route(BaseModel):
    route_id: str
    business_date: date
    plan_type: str
    route_label: str | None = None
    truck_id: str | None = None
    driver_name: str | None = None
    depot_code: str | None = None
    route_status: str | None = None
    total_stops: int | None = None
    total_distance_km: float | None = None
    cost_of_transport_thb: float | None = None
    total_cash_delivered_thb: float | None = None
    total_cash_collected_thb: float | None = None
    stops: list[RouteStop] = []


@router.get("/health")
def get_health():
    try:
        return repo.health()
    except Exception as e:
        log.exception("v2 /health failed")
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/branches", response_model=list[Branch])
def get_branches(date_: str | None = Query(default=None, alias="date")):
    try:
        return repo.fetch_branches(date_)
    except Exception as e:
        log.exception("v2 /branches failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines", response_model=list[Machine])
def get_machines(date_: str | None = Query(default=None, alias="date")):
    try:
        return repo.fetch_machines(date_)
    except Exception as e:
        log.exception("v2 /machines failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/branches/{branch_code}/cash-flow", response_model=list[CashFlowPoint])
def get_branch_cash_flow(branch_code: str, date_: str | None = Query(default=None, alias="date")):
    try:
        return repo.fetch_cash_flow("BRANCH", branch_code, date_)
    except Exception as e:
        log.exception("v2 /branches/{code}/cash-flow failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/cash-flow", response_model=list[CashFlowPoint])
def get_machine_cash_flow(machine_id: str, date_: str | None = Query(default=None, alias="date")):
    try:
        return repo.fetch_cash_flow("MACHINE", machine_id, date_)
    except Exception as e:
        log.exception("v2 /machines/{id}/cash-flow failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/branches/{branch_code}/denomination-gap", response_model=list[DenominationGap])
def get_branch_denomination_gap(branch_code: str, date_: str | None = Query(default=None, alias="date")):
    try:
        return repo.fetch_denomination_gap("BRANCH", branch_code, date_)
    except Exception as e:
        log.exception("v2 /branches/{code}/denomination-gap failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/denomination-gap", response_model=list[DenominationGap])
def get_machine_denomination_gap(machine_id: str, date_: str | None = Query(default=None, alias="date")):
    try:
        return repo.fetch_denomination_gap("MACHINE", machine_id, date_)
    except Exception as e:
        log.exception("v2 /machines/{id}/denomination-gap failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/routes", response_model=list[Route])
def get_routes(date_: str | None = Query(default=None, alias="date"), plan_type: str | None = Query(default=None)):
    try:
        return repo.fetch_routes(date_, plan_type)
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
        resolved_date, data = repo.fetch_branch_tracks(date_)
        return {"source": "unity_catalog", "businessDate": resolved_date, "branches": data}
    except Exception as e:
        log.exception("v2 /branch-tracks failed")
        return {"source": "error", "error": str(e), "branches": []}


@router.get("/branch-inputs")
def get_branch_inputs(date_: str | None = Query(default=None, alias="date")):
    try:
        data = repo.fetch_branch_inputs(date_)
        return {"source": "unity_catalog", "branches": data}
    except Exception as e:
        log.exception("v2 /branch-inputs failed")
        return {"source": "error", "error": str(e), "branches": []}


@router.get("/machine-tracks")
def get_machine_tracks(date_: str | None = Query(default=None, alias="date")):
    try:
        resolved_date, data = repo.fetch_machine_tracks(date_)
        return {"source": "unity_catalog", "businessDate": resolved_date, "machines": data}
    except Exception as e:
        log.exception("v2 /machine-tracks failed")
        return {"source": "error", "error": str(e), "machines": []}


@router.get("/route-executions")
def get_route_executions(date_: str | None = Query(default=None, alias="date"), plan_type: str | None = Query(default=None)):
    try:
        resolved_date, data = repo.fetch_route_executions(date_, plan_type)
        return {"source": "unity_catalog", "businessDate": resolved_date, "routes": data}
    except Exception as e:
        log.exception("v2 /route-executions failed")
        return {"source": "error", "error": str(e), "routes": []}


# ── Fleet config ──────────────────────────────────────────────────────────

@router.get("/fleet")
def get_fleet():
    try:
        data = repo.fetch_fleet()
        log.info("v2 /fleet OK: %d trucks", len(data))
        return {"source": "unity_catalog", "trucks": data}
    except Exception as e:
        log.exception("v2 /fleet failed")
        return {"source": "error", "error": str(e), "errorType": type(e).__name__, "trucks": []}


class TruckAvailabilityUpdate(BaseModel):
    truckId: str
    isAvailable: bool


@router.post("/fleet/availability")
def post_fleet_availability(body: TruckAvailabilityUpdate):
    try:
        repo.update_truck_availability(body.truckId, body.isAvailable)
        return {"ok": True, "truckId": body.truckId, "isAvailable": body.isAvailable}
    except Exception as e:
        log.exception("v2 /fleet/availability failed")
        raise HTTPException(status_code=500, detail=str(e))


# ── Route parameters config ───────────────────────────────────────────────

@router.get("/route-params")
def get_route_params():
    try:
        data = repo.fetch_route_params()
        log.info("v2 /route-params OK: %d params", len(data))
        return {"source": "unity_catalog", "params": data}
    except Exception as e:
        log.exception("v2 /route-params failed")
        return {"source": "error", "error": str(e), "errorType": type(e).__name__, "params": []}


class RouteParamUpdate(BaseModel):
    parameter: str
    value: float


@router.post("/route-params")
def post_route_param(body: RouteParamUpdate):
    try:
        repo.update_route_param(body.parameter, body.value)
        return {"ok": True, "parameter": body.parameter, "value": body.value}
    except Exception as e:
        log.exception("v2 /route-params update failed")
        raise HTTPException(status_code=500, detail=str(e))
