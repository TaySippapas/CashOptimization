"""Unity Catalog reads for the ktb_cash_route.ops dimension/fact schema.

Standalone from server/uc_repo.py (the existing flat-table pipeline) — see
DATABRICKS_NEW_PIPELINE_PROCEDURE.md. Uses its own connection (own catalog,
schema, warehouse) so the two pipelines can't collide.

Every public fetch_* function opens exactly ONE connection and reuses its
cursor for all queries it needs — opening a fresh connection costs ~5s here
(auth handshake), so a function that used to run N queries on N separate
connections (measured: 58s for fetch_machine_tracks's 4 queries) now runs
them on one (measured: ~2-3s after warmup). See DATABRICKS_NEW_PIPELINE_PROCEDURE.md.
"""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from functools import lru_cache
from typing import Any, Iterator, Sequence

from databricks import sql
from databricks.sdk.core import Config

from server.uc_repo import (
    _bool,
    _date_str,
    _day_label,
    _int,
    _map_action,
    _map_health,
    _map_risk,
    _num,
    _ROUTE_STATUS_UI,
    _STOP_TYPE_UI,
)

log = logging.getLogger(__name__)

CATALOG = os.getenv("V2_CATALOG", "mdp_dev_dit")
SCHEMA = os.getenv("V2_SCHEMA", "default")
WAREHOUSE_ID = os.getenv("V2_WAREHOUSE_ID", "ef9767b2a2846fa7")


def _t(name: str) -> str:
    return f"{CATALOG}.{SCHEMA}.{name}"


@lru_cache(maxsize=1)
def _config() -> Config:
    # Config() shells out to `databricks auth token --force-refresh` on
    # construction. Building a fresh one per connection meant concurrent
    # requests raced on the local CLI token cache and some lost (exit status
    # 45 -> 503s under load). One process-wide instance avoids both the
    # redundant subprocess calls and the race.
    return Config()


@contextmanager
def _connection() -> Iterator[Any]:
    cfg = _config()
    conn = sql.connect(
        server_hostname=cfg.host,
        http_path=f"/sql/1.0/warehouses/{WAREHOUSE_ID}",
        credentials_provider=lambda: cfg.authenticate,
    )
    try:
        yield conn
    finally:
        conn.close()


def _query(cur: Any, statement: str, params: Sequence[Any] | None = None) -> list[dict[str, Any]]:
    """Run a query on an already-open cursor (see module docstring for why)."""
    cur.execute(statement, tuple(params) if params else None)
    cols = [d[0] for d in (cur.description or [])]
    rows = cur.fetchall() or []
    return [dict(zip(cols, row)) for row in rows]


def latest_business_date(cur: Any = None) -> str | None:
    def _run(c: Any) -> str | None:
        rows = _query(c, f"SELECT MAX(business_date) AS d FROM {_t('fact_cash_position')}")
        d = rows[0]["d"] if rows else None
        return d.isoformat() if d else None

    if cur is not None:
        return _run(cur)
    with _connection() as conn:
        with conn.cursor() as c:
            return _run(c)


def _resolve_date(cur: Any, business_date: str | None) -> str:
    return business_date or latest_business_date(cur)


def health() -> dict[str, Any]:
    with _connection() as conn:
        with conn.cursor() as cur:
            _query(cur, "SELECT 1")
            business_date = latest_business_date(cur)
    return {
        "status": "ok",
        "useUnityCatalog": True,
        "catalog": CATALOG,
        "schema": SCHEMA,
        "warehouseId": WAREHOUSE_ID,
        "businessDate": business_date,
        "businessDateMode": "auto",
    }


def fetch_branches(business_date: str | None = None) -> list[dict[str, Any]]:
    with _connection() as conn:
        with conn.cursor() as cur:
            d = _resolve_date(cur, business_date)
            return _query(
                cur,
                f"""
                SELECT b.branch_code, b.branch_name, b.district_name, b.center_id,
                       b.latitude, b.longitude, b.cash_capacity_thb, b.min_threshold_thb,
                       p.actual_cash_d_minus_1, p.predicted_cash_d, p.predicted_deposit_d,
                       p.predicted_withdrawal_d, p.action_type, p.health_status, p.emergency_flag
                FROM {_t('dim_branch')} b
                JOIN {_t('fact_cash_position')} p
                  ON p.branch_code = b.branch_code
                WHERE p.business_date = ?
                ORDER BY b.branch_code
                """,
                [d],
            )


def fetch_machines(business_date: str | None = None) -> list[dict[str, Any]]:
    # Machine tables not yet migrated to new schema — return empty
    # TODO: Implement with fact_machine_position when machine tables are ready
    log.info("fetch_machines: machine tables not yet available in new schema")
    return []


def fetch_cash_flow(entity_type: str, entity_code: str, business_date: str | None = None) -> list[dict[str, Any]]:
    if entity_type not in {"BRANCH", "MACHINE"}:
        raise ValueError("entity_type must be BRANCH or MACHINE")
    if entity_type == "MACHINE":
        # Machine flow table not yet migrated — return empty
        return []
    with _connection() as conn:
        with conn.cursor() as cur:
            d = _resolve_date(cur, business_date)
            return _query(
                cur,
                f"""
                SELECT series_date, value_type, deposit_amount_thb, withdrawal_amount_thb,
                       net_amount_thb, remaining_amount_thb
                FROM {_t('fact_cash_flow_daily')}
                WHERE business_date = ? AND branch_code = ?
                ORDER BY series_date
                """,
                [d, entity_code],
            )


def fetch_denomination_gap(entity_type: str, entity_code: str, business_date: str | None = None) -> list[dict[str, Any]]:
    if entity_type not in {"BRANCH", "MACHINE"}:
        raise ValueError("entity_type must be BRANCH or MACHINE")
    if entity_type == "MACHINE":
        # Machine denomination table not yet migrated — return empty
        return []
    with _connection() as conn:
        with conn.cursor() as cur:
            d = _resolve_date(cur, business_date)
            return _query(
                cur,
                f"""
                SELECT denomination_thb, target_note_count, target_amount_thb, target_mix_pct,
                       actual_note_count_d_minus_1, actual_mix_pct, delivery_note_count, delivery_amount_thb
                FROM {_t('fact_branch_denomination')}
                WHERE business_date = ? AND branch_code = ?
                ORDER BY denomination_thb DESC
                """,
                [d, entity_code],
            )


def _latest_route_date(cur: Any) -> str | None:
    """Get the most recent business_date available in fact_route_summary."""
    rows = _query(cur, f"SELECT MAX(business_date) AS d FROM {_t('fact_route_summary')}")
    d = rows[0]["d"] if rows else None
    return str(d) if d else None


def _resolve_route_date(cur: Any, business_date: str | None) -> str:
    """Route data lives on a different date than branch/machine. Resolve accordingly."""
    return business_date or _latest_route_date(cur) or _resolve_date(cur, business_date)


# Map DB action_type → frontend StopType expected by RoutePathMap
_ACTION_TO_UI_TYPE = {
    "START": "Start",
    "DELIVERY": "Deliver",
    "PICKUP": "Pickup",
    "SWAP": "Mixed",
    "BOTH": "Mixed",
    "RETURN": "Return",
}

# Color palette for route assignment (frontend can override, but we provide defaults)
_ROUTE_COLORS = [
    "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
    "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
    "#84cc16", "#d946ef", "#0ea5e9", "#facc15", "#a855f7", "#10b981",
]


def fetch_routes(business_date: str | None = None, plan_type: str | None = None) -> list[dict[str, Any]]:
    """Raw route data for debugging/admin. Returns summary + stops joined."""
    with _connection() as conn:
        with conn.cursor() as cur:
            d = _resolve_route_date(cur, business_date)
            routes = _query(
                cur,
                f"""
                SELECT truck_id, business_date, route_plan_type, plan_version,
                       depot_code, depot_name, route_status, total_stops, total_distance_km,
                       cost_of_transport, delivery_amount_thb_branch, delivery_amount_thb_machine,
                       vehicle_capacity_thb, vehicle_utilization_pct, etd_start, eta_return
                FROM {_t('fact_route_summary')}
                WHERE business_date = ? AND (? IS NULL OR route_plan_type = ?)
                ORDER BY truck_id
                """,
                [d, plan_type, plan_type],
            )
            stops = _query(
                cur,
                f"""
                SELECT truck_id, route_plan_type, stop_sequence, stop_code, stop_name, stop_type,
                       action_type, stop_status, eta, etd, delivery_amount_thb, pickup_amount_thb,
                       latitude, longitude, leg_km, cumulative_km
                FROM {_t('fact_route_stop')}
                WHERE business_date = ? AND (? IS NULL OR route_plan_type = ?)
                ORDER BY truck_id, stop_sequence
                """,
                [d, plan_type, plan_type],
            )
    stops_by_truck: dict[str, list[dict[str, Any]]] = {}
    for s in stops:
        stops_by_truck.setdefault(s["truck_id"], []).append(s)
    for r in routes:
        r["stops"] = stops_by_truck.get(r["truck_id"], [])
    return routes


# ── Frontend-shaped mappers ──────────────────────────────────────────────
# These mirror server/uc_repo.py's fetch_branches / fetch_machines /
# fetch_branch_inputs_for_config / fetch_routes output shapes exactly (same
# dict keys) so the React app's existing types (BranchTrack, Machine,
# RouteExecution in frontend/src/types/) work unchanged — only the fetch URL
# in frontend/src/api/backend.ts needs to change.

_DENOM_KEY = {1000: "b1000", 500: "b500", 100: "b100", 50: "b50"}


def fetch_branch_tracks(business_date: str | None = None) -> tuple[str, list[dict[str, Any]]]:
    """BranchTrack[] shape (excludes the depot, matching uc_repo.fetch_branches).
    Returns (resolved_business_date, rows) — avoids a second connection just
    to report the date in the API response envelope."""
    with _connection() as conn:
        with conn.cursor() as cur:
            d = _resolve_date(cur, business_date)
            snaps = _query(
                cur,
                f"""
                SELECT b.branch_code, b.branch_name, b.district_name, b.latitude, b.longitude,
                       b.cash_capacity_thb, b.min_threshold_thb, b.service_minutes, b.window_start, b.window_end,
                       p.actual_cash_d_minus_1, p.predicted_cash_d, p.predicted_deposit_d, p.predicted_withdrawal_d,
                       p.action_type, p.health_status, p.emergency_flag,
                       p.delivery_amount_thb
                FROM {_t('dim_branch')} b
                JOIN {_t('fact_cash_position')} p ON p.branch_code = b.branch_code
                WHERE p.business_date = ?
                ORDER BY b.branch_code
                """,
                [d],
            )
            flows = _query(
                cur,
                f"""
                SELECT branch_code, series_date, value_type, deposit_amount_thb, withdrawal_amount_thb, net_amount_thb
                FROM {_t('fact_cash_flow_daily')}
                WHERE business_date = ?
                ORDER BY branch_code, series_date
                """,
                [d],
            )
            gaps = _query(
                cur,
                f"""
                SELECT branch_code, denomination_thb, delivery_amount_thb,
                       actual_amount_thb_d_minus_1 AS actual_amount_thb
                FROM {_t('fact_branch_denomination')}
                WHERE business_date = ?
                """,
                [d],
            )

    flow_by: dict[str, list[dict[str, Any]]] = {}
    for r in flows:
        flow_by.setdefault(r["branch_code"], []).append(r)

    gap_by: dict[str, dict[str, Any]] = {}
    for r in gaps:
        code = r["branch_code"]
        dd = gap_by.setdefault(code, {
            "b1000": 0, "b500": 0, "b100": 0, "b50": 0,
            "actual_b1000": 0, "actual_b500": 0, "actual_b100": 0, "actual_b50": 0,
        })
        key = _DENOM_KEY.get(_int(r["denomination_thb"]))
        if key:
            dd[key] = _num(r["delivery_amount_thb"])
            dd[f"actual_{key}"] = _num(r.get("actual_amount_thb"))

    out: list[dict[str, Any]] = []
    for b in snaps:
        code = b["branch_code"]
        by_day: dict[str, dict[str, Any]] = {}
        for f in flow_by.get(code, []):
            day = _date_str(f["series_date"])
            prev = by_day.get(day)
            if prev is None or str(f.get("value_type")).upper() == "ACTUAL":
                by_day[day] = f
        trend = [
            {
                "day": _day_label(day),
                "deposit": _num(f["deposit_amount_thb"]),
                "withdraw": _num(f["withdrawal_amount_thb"]),
                "net": _num(f["net_amount_thb"]),
            }
            for day, f in sorted(by_day.items())
        ]
        deposit = _num(b["predicted_deposit_d"])
        withdraw = _num(b["predicted_withdrawal_d"])
        opening = _num(b["actual_cash_d_minus_1"])
        capacity = _num(b["cash_capacity_thb"])
        predicted_cash = _num(b["predicted_cash_d"])
        utilization_pct = round(opening / capacity * 100, 1) if capacity > 0 else 0
        fill_amount = _num(b.get("delivery_amount_thb"))
        out.append(
            {
                "code": code,
                "name": b["branch_name"],
                "district": b.get("district_name") or "",
                "lat": _num(b["latitude"]),
                "lng": _num(b["longitude"]),
                "isDepot": False,
                "currentCash": opening,
                "deposit": deposit,
                "withdraw": withdraw,
                "forecastNet": deposit - withdraw,
                "predictedCash": predicted_cash,
                "cashCapacity": capacity,
                "minThreshold": _num(b["min_threshold_thb"]),
                "openingCash": opening,
                "predictedInflow": deposit,
                "predictedOutflow": withdraw,
                "action": _map_action(b.get("action_type")),
                "health": _map_health(b.get("health_status")),
                "confidence": 95,  # placeholder until model outputs confidence
                "emergency": _bool(b.get("emergency_flag")),
                "trend": trend,
                "denominationGap": gap_by.get(code, {
                    "b1000": 0, "b500": 0, "b100": 0, "b50": 0,
                    "actual_b1000": 0, "actual_b500": 0, "actual_b100": 0, "actual_b50": 0,
                }),
                "fillAmount": fill_amount,
                "utilizationPct": utilization_pct,
                "serviceMinutes": _int(b.get("service_minutes"), 20),
                "windowStart": b.get("window_start") or "08:00",
                "windowEnd": b.get("window_end") or "17:00",
            }
        )
    return d, out


def fetch_branch_inputs(business_date: str | None = None) -> list[dict[str, Any]]:
    """BranchInput[] shape — for Configure Inputs."""
    with _connection() as conn:
        with conn.cursor() as cur:
            d = _resolve_date(cur, business_date)
            snaps = _query(
                cur,
                f"""
                SELECT b.branch_code, b.branch_name, b.district_name, b.latitude, b.longitude,
                       b.cash_capacity_thb, b.min_threshold_thb, b.service_minutes, b.window_start, b.window_end,
                       p.actual_cash_d_minus_1, p.predicted_deposit_d, p.predicted_withdrawal_d
                FROM {_t('dim_branch')} b
                JOIN {_t('fact_cash_position')} p ON p.branch_code = b.branch_code
                WHERE p.business_date = ?
                ORDER BY b.branch_code
                """,
                [d],
            )
    return [
        {
            "code": b["branch_code"],
            "name": b["branch_name"],
            "district": b.get("district_name") or "",
            "lat": _num(b["latitude"]),
            "lng": _num(b["longitude"]),
            "isDepot": False,
            "cashCapacity": _num(b["cash_capacity_thb"]),
            "minThreshold": _num(b["min_threshold_thb"]),
            "openingCash": _num(b["actual_cash_d_minus_1"]),
            "predictedInflow": _num(b["predicted_deposit_d"]),
            "predictedOutflow": _num(b["predicted_withdrawal_d"]),
            "serviceMinutes": _int(b.get("service_minutes")) or None,
            "windowStart": b.get("window_start") or "08:00",
            "windowEnd": b.get("window_end") or "17:00",
        }
        for b in snaps
    ]


def _latest_machine_date(cur: Any) -> str | None:
    """Latest business_date in fact_machine_position (may differ from branch date)."""
    rows = _query(cur, f"SELECT MAX(business_date) AS d FROM {_t('fact_machine_position')}")
    d = rows[0]["d"] if rows else None
    return d.isoformat() if d else None


def fetch_machine_tracks(business_date: str | None = None) -> tuple[str, list[dict[str, Any]]]:
    """Machine[] shape (tracking.ts), including a denomination *mix* (predicted remaining).
    Returns (resolved_business_date, rows)."""
    with _connection() as conn:
        with conn.cursor() as cur:
            d = business_date or _latest_machine_date(cur) or _resolve_date(cur, business_date)
            # 1. Position + dimension join
            snaps = _query(
                cur,
                f"""
                SELECT m.machine_id, m.machine_type, m.location_name, m.district_name, m.latitude, m.longitude,
                       m.alltime_max_cash_thb,
                       p.actual_cash_d_minus_1, p.predicted_cash_d, p.predicted_deposit_d,
                       p.predicted_withdrawal_d, p.action_type, p.health_status, p.emergency_flag,
                       p.delivery_amount_thb, p.remove_amount_thb
                FROM {_t('dim_machine')} m
                JOIN {_t('fact_machine_position')} p ON p.machine_id = m.machine_id
                WHERE p.business_date = ?
                ORDER BY m.machine_id
                """,
                [d],
            )
            # 2. Flow daily (trend)
            flows = _query(
                cur,
                f"""
                SELECT machine_id, series_date, value_type, deposit_amount_thb,
                       withdrawal_amount_thb, net_amount_thb
                FROM {_t('fact_machine_flow_daily')}
                WHERE business_date = ?
                ORDER BY machine_id, series_date
                """,
                [d],
            )
            # 3. Denomination (full detail for donut + tooltip)
            denoms = _query(
                cur,
                f"""
                SELECT machine_id, denomination_thb,
                       actual_note_count_d_minus_1, actual_amount_thb_d_minus_1,
                       predicted_remaining_note_count, predicted_remaining_amount_thb,
                       alltime_max_note_count,
                       delivery_note_count, delivery_amount_thb,
                       remove_note_count, remove_amount_thb
                FROM {_t('fact_machine_denomination')}
                WHERE business_date = ?
                """,
                [d],
            )

    # Build lookups
    flow_by: dict[str, list[dict[str, Any]]] = {}
    for r in flows:
        flow_by.setdefault(r["machine_id"], []).append(r)

    # Denomination: build both mix (note counts for donut) and detail (for tooltip)
    denom_mix_by: dict[str, dict[str, int]] = {}  # {machine: {b1000: notes, b500: notes, b100: notes}}
    denom_detail_by: dict[str, list[dict[str, Any]]] = {}  # {machine: [{denom, ...}]}
    for r in denoms:
        mid = r["machine_id"]
        denom_val = _int(r["denomination_thb"])
        key = {1000: "b1000", 500: "b500", 100: "b100"}.get(denom_val)
        if not key:
            continue
        # Mix (note counts for donut)
        dd = denom_mix_by.setdefault(mid, {"b1000": 0, "b500": 0, "b100": 0})
        dd[key] = _int(r["predicted_remaining_note_count"]) or 0
        # Detail (for tooltip)
        detail_list = denom_detail_by.setdefault(mid, [])
        detail_list.append({
            "denom": denom_val,
            "actualNotes": _int(r["actual_note_count_d_minus_1"]) or 0,
            "actualThb": _num(r["actual_amount_thb_d_minus_1"]),
            "predictedNotes": _int(r["predicted_remaining_note_count"]) or 0,
            "predictedThb": _num(r["predicted_remaining_amount_thb"]),
            "maxNotes": _int(r["alltime_max_note_count"]) or 0,
            "addNotes": _int(r["delivery_note_count"]) or 0,
            "addThb": _num(r["delivery_amount_thb"]),
            "removeNotes": _int(r["remove_note_count"]) or 0,
            "removeThb": _num(r["remove_amount_thb"]),
        })

    # Map action_type to frontend TrackAction
    def _machine_action(act: str | None) -> str:
        a = (act or "").strip()
        if a == "Swap (Near Full)":
            return "Pickup"
        if a == "Swap (Near Empty)":
            return "Deliver"
        return "No Action"

    # Derive simple risk from action (health_status not yet implemented)
    def _machine_risk(act: str | None) -> str:
        a = (act or "").strip()
        if "Swap" in a:
            return "High"
        return "Low"

    out: list[dict[str, Any]] = []
    for m in snaps:
        mid = m["machine_id"]
        # Build trend
        by_day: dict[str, dict[str, Any]] = {}
        for f in flow_by.get(mid, []):
            day = _date_str(f["series_date"])
            prev = by_day.get(day)
            if prev is None or str(f.get("value_type")).upper() == "ACTUAL":
                by_day[day] = f
        trend = [
            {
                "day": _day_label(day),
                "deposit": _num(f["deposit_amount_thb"]),
                "withdraw": _num(f["withdrawal_amount_thb"]),
                "net": _num(f["net_amount_thb"]),
            }
            for day, f in sorted(by_day.items())
        ]
        health_raw = m.get("health_status")
        health = _map_health(health_raw) if health_raw else "No Data"
        out.append(
            {
                "id": mid,
                "machineType": m.get("machine_type") or "",
                "location": m["location_name"] or "",
                "district": m.get("district_name") or "",
                "lat": _num(m["latitude"]),
                "lng": _num(m["longitude"]),
                "currentCash": _num(m["actual_cash_d_minus_1"]),
                "predictedEod": _num(m["predicted_cash_d"]),
                "cashCapacity": _num(m["alltime_max_cash_thb"]),
                "confidence": None,
                "action": _machine_action(m.get("action_type")),
                "health": health,
                "riskLevel": _machine_risk(m.get("action_type")),
                "emergency": _bool(m.get("emergency_flag")),
                "depositToday": _num(m["predicted_deposit_d"]),
                "withdrawToday": _num(m["predicted_withdrawal_d"]),
                "addAmount": _num(m["delivery_amount_thb"]),
                "removeAmount": _num(m["remove_amount_thb"]),
                "denomination": denom_mix_by.get(mid, {"b1000": 0, "b500": 0, "b100": 0}),
                "denominationDetail": sorted(denom_detail_by.get(mid, []), key=lambda x: -x["denom"]),
                "trend": trend,
            }
        )
    return d, out




def fetch_route_executions(
    business_date: str | None = None, plan_type: str | None = None
) -> tuple[str, list[dict[str, Any]]]:
    """RouteExecution[] shape for frontend consumption.

    Reads from fact_route_summary + fact_route_stop (new schema).
    Uses truck_id as the route identifier (routes are per-truck-per-day).
    Returns (resolved_business_date, rows).
    """
    with _connection() as conn:
        with conn.cursor() as cur:
            d = _resolve_route_date(cur, business_date)
            if not d:
                return "", []

            routes = _query(
                cur,
                f"""
                SELECT s.truck_id, t.plate_number,
                       s.route_plan_type, s.plan_version,
                       s.depot_code, s.depot_name, s.depot_latitude, s.depot_longitude,
                       s.route_status, s.total_stops, s.total_distance_km, s.total_duration_minutes,
                       s.etd_start, s.eta_return,
                       s.vehicle_capacity_thb, s.vehicle_utilization_pct,
                       s.delivery_amount_thb_branch, s.delivery_amount_thb_machine,
                       s.pickup_amount_thb_branch,
                       s.cost_of_transport, s.cit_cost_thb,
                       s.normal_hours, s.ot_hours,
                       s.fuel_cost_thb, s.repair_cost_thb, s.maintenance_cost_thb,
                       s.normal_wage_thb, s.ot_wage_thb,
                       s.machine_stops, s.completed_stops, s.remaining_stops,
                       s.cash_on_board_thb, s.sla_achievement_pct
                FROM {_t('fact_route_summary')} s
                LEFT JOIN {_t('dim_truck')} t ON t.truck_id = s.truck_id
                WHERE s.business_date = ? AND (? IS NULL OR s.route_plan_type = ?)
                ORDER BY s.truck_id
                """,
                [d, plan_type, plan_type],
            )
            stops = _query(
                cur,
                f"""
                SELECT truck_id, route_plan_type, stop_sequence, stop_code, stop_name,
                       stop_type, action_type, stop_status, eta, etd,
                       delivery_amount_thb, pickup_amount_thb, latitude, longitude,
                       leg_km, cumulative_km
                FROM {_t('fact_route_stop')}
                WHERE business_date = ? AND (? IS NULL OR route_plan_type = ?)
                ORDER BY truck_id, stop_sequence
                """,
                [d, plan_type, plan_type],
            )
    stops_by: dict[str, list[dict[str, Any]]] = {}
    for s in stops:
        stops_by.setdefault(s["truck_id"], []).append(s)

    out: list[dict[str, Any]] = []
    for idx, r in enumerate(routes):
        tid = r["truck_id"]
        stop_rows = stops_by.get(tid, [])
        stop_list = []
        path: list[list[float]] = []
        for st in stop_rows:
            lat, lng = _num(st["latitude"]), _num(st["longitude"])
            if lat and lng:
                path.append([lat, lng])
            action = str(st.get("action_type") or "").upper()
            deliver = _num(st.get("delivery_amount_thb"))
            pickup = _num(st.get("pickup_amount_thb"))
            stop_list.append(
                {
                    "seq": _int(st["stop_sequence"]),
                    "code": st["stop_code"] or "",
                    "location": st["stop_name"] or "",
                    # "type" = RoutePathMap-compatible (Start/Deliver/Return)
                    "type": _ACTION_TO_UI_TYPE.get(action, "Deliver"),
                    # "category" = display label (ATM/Branch/Depot/RCM/3IN1/Other Bank)
                    "category": st["stop_type"] or "",
                    "actionType": action,
                    "status": st.get("stop_status") or "Pending",
                    "eta": st.get("eta") or "",
                    "etd": st.get("etd") or "",
                    "lat": lat,
                    "lng": lng,
                    # "amount" = signed amount for RoutePathMap popup (+ deliver, - pickup)
                    "amount": deliver - pickup,
                    "deliveryAmount": deliver,
                    "pickupAmount": pickup,
                    "legKm": _num(st.get("leg_km")),
                    "cumulativeKm": _num(st.get("cumulative_km")),
                }
            )

        status_key = str(r.get("route_status") or "").upper().replace(" ", "_")
        delivery_total = _num(r.get("delivery_amount_thb_branch")) + _num(r.get("delivery_amount_thb_machine"))
        pickup_total = _num(r.get("pickup_amount_thb_branch"))

        out.append(
            {
                "routeId": tid,  # truck_id as route identifier
                "truckId": tid,
                "plateNumber": r.get("plate_number") or "",
                "label": tid,    # vehicle code as label (route_label removed)
                "status": _ROUTE_STATUS_UI.get(status_key, "On Track"),
                "depot": r.get("depot_name") or r.get("depot_code") or "",
                "depotLat": _num(r.get("depot_latitude")),
                "depotLng": _num(r.get("depot_longitude")),
                "totalStops": _int(r["total_stops"]),
                "completed": _int(r.get("completed_stops")) or 0,
                "remaining": _int(r.get("remaining_stops")) or _int(r["total_stops"]),
                "distanceKm": _num(r["total_distance_km"]),
                "distanceLeftKm": _num(r.get("distance_left_km")) or _num(r["total_distance_km"]),
                "durationMinutes": _int(r.get("total_duration_minutes")),
                "etdStart": r.get("etd_start") or "",
                "etaReturn": r.get("eta_return") or "",
                "vehicleCapacity": _num(r.get("vehicle_capacity_thb")),
                "cashOnBoard": _num(r.get("cash_on_board_thb")) or delivery_total,
                "pickupAmount": pickup_total,
                "deliveryAmount": delivery_total,
                "deliveryBranch": _num(r.get("delivery_amount_thb_branch")),
                "deliveryMachine": _num(r.get("delivery_amount_thb_machine")),
                "color": _ROUTE_COLORS[idx % len(_ROUTE_COLORS)],
                "path": path,
                "stops": stop_list,
                "planType": str(r["route_plan_type"]).upper(),
                "utilizationPct": _num(r.get("vehicle_utilization_pct")),
                "citCostThb": _num(r.get("cit_cost_thb")),
                "costOfTransport": _num(r.get("cost_of_transport")),
                "slaPct": _num(r.get("sla_achievement_pct")),
                # Cost breakdown detail
                "normalHours": _num(r.get("normal_hours")),
                "otHours": _num(r.get("ot_hours")),
                "fuelCost": _num(r.get("fuel_cost_thb")),
                "repairCost": _num(r.get("repair_cost_thb")),
                "maintenanceCost": _num(r.get("maintenance_cost_thb")),
                "normalWage": _num(r.get("normal_wage_thb")),
                "otWage": _num(r.get("ot_wage_thb")),
                "machineStops": _int(r.get("machine_stops")),
            }
        )
    return d, out


# ── Fleet (dim_truck) ────────────────────────────────────────────────────

def fetch_fleet() -> list[dict[str, Any]]:
    """Return all trucks from dim_truck for the config page."""
    with _connection() as conn:
        with conn.cursor() as cur:
            rows = _query(
                cur,
                f"""SELECT truck_id, center_id, plate_number,
                       cash_capacity_thb, is_available, updated_at
                FROM {_t('dim_truck')}
                ORDER BY truck_id""",
            )
    return [
        {
            "truckId": r["truck_id"],
            "centerId": r.get("center_id") or "",
            "plateNumber": r.get("plate_number") or "",
            "cashCapacity": _num(r.get("cash_capacity_thb")),
            "isAvailable": bool(r.get("is_available", True)),
            "updatedAt": _date_str(r.get("updated_at")),
        }
        for r in rows
    ]


def update_truck_availability(truck_id: str, is_available: bool) -> bool:
    """Toggle is_available flag for a single truck. Returns True on success."""
    with _connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE {_t('dim_truck')} SET is_available = ?, updated_at = current_timestamp() WHERE truck_id = ?",
                [is_available, truck_id],
            )
    return True


# ── Route Parameters (dim_route_parameter) ───────────────────────────────

def fetch_route_params() -> list[dict[str, Any]]:
    """Return all 24 route parameters grouped by type."""
    with _connection() as conn:
        with conn.cursor() as cur:
            rows = _query(
                cur,
                f"""SELECT parameter_type, parameter, description, value, remark, updated_at
                FROM {_t('dim_route_parameter')}
                ORDER BY parameter_type, parameter""",
            )
    return [
        {
            "parameterType": r["parameter_type"],
            "parameter": r["parameter"],
            "description": r.get("description") or "",
            "value": _num(r.get("value")),
            "remark": r.get("remark") or "",
            "updatedAt": _date_str(r.get("updated_at")),
        }
        for r in rows
    ]


def update_route_param(parameter: str, value: float) -> bool:
    """Update a single route parameter value. Returns True on success."""
    with _connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE {_t('dim_route_parameter')} SET value = ?, updated_at = current_timestamp() WHERE parameter = ?",
                [value, parameter],
            )
    return True
