"""Map Unity Catalog tables into the JSON shapes the React app expects."""
from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from server.mock import build_plan
from server.settings import get_settings
from server.sql_client import query_dicts

log = logging.getLogger(__name__)


def _num(v: Any, default: float = 0.0) -> float:
    if v is None:
        return default
    if isinstance(v, Decimal):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _int(v: Any, default: int = 0) -> int:
    return int(_num(v, default))


def _bool(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if v is None:
        return False
    return str(v).lower() in {"1", "true", "t", "y", "yes"}


def _date_str(v: Any) -> str:
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    return str(v)[:10] if v is not None else ""


def _day_label(v: Any) -> str:
    """Format series_date as 'DD MMM' for trend charts."""
    s = _date_str(v)
    try:
        d = date.fromisoformat(s)
        return d.strftime("%d %b")
    except ValueError:
        return s


_ACTION_UI = {
    "DELIVERY": "Deliver",
    "DELIVER": "Deliver",
    "PICKUP": "Pickup",
    "BOTH": "Both",
    "NO_ACTION": "No Action",
    "NO ACTION": "No Action",
    "OK": "No Action",
}

_HEALTH_UI = {
    "HEALTHY": "Healthy",
    "WATCH": "Watch",
    "ACTION_NEEDED": "Action Needed",
    "ACTION NEEDED": "Action Needed",
    "CRITICAL": "Critical",
    "NO_DATA": "No Data",
}

_RISK_UI = {
    "VERY_HIGH": "Very High",
    "HIGH": "High",
    "MEDIUM": "Medium",
    "LOW": "Low",
}

_ROUTE_STATUS_UI = {
    "ON_TRACK": "On Track",
    "DELAYED": "Delayed",
    "AT_RISK": "At Risk",
}

_STOP_TYPE_UI = {
    "START": "Start",
    "DELIVERY": "Deliver",
    "DELIVER": "Deliver",
    "PICKUP": "Pickup",
    "MIXED": "Mixed",
    "BOTH": "Mixed",
    "RETURN": "Return",
    "EMERGENCY": "Deliver",
}

_STOP_STATUS_UI = {
    "COMPLETED": "Completed",
    "IN_PROGRESS": "In Progress",
    "PENDING": "Pending",
}


def _map_action(v: Any) -> str:
    return _ACTION_UI.get(str(v or "").upper().replace("-", "_"), str(v or "No Action"))


def _map_health(v: Any) -> str:
    key = str(v or "").upper().replace(" ", "_")
    return _HEALTH_UI.get(key, str(v or "Healthy"))


def _map_risk(v: Any) -> str:
    key = str(v or "").upper().replace(" ", "_")
    return _RISK_UI.get(key, str(v or "Low"))


def _resolve_business_date(s) -> str:
    """Resolve planning date: fixed config, or latest date present in UC."""
    configured = (s.business_date or "").strip()
    if configured and configured.lower() not in {"auto", "latest", "*"}:
        return configured[:10]

    rc = (s.region_code or "").replace("'", "")
    rows = query_dicts(
        f"""
        SELECT MAX(business_date) AS business_date
        FROM {s.table('app_settings')}
        WHERE region_code = '{rc}'
        """
    )
    if rows and rows[0].get("business_date") is not None:
        return _date_str(rows[0]["business_date"])

    # Fallback: any fact table max date
    for table in ("machine_snapshot", "branch_snapshot", "route_summary"):
        try:
            rows = query_dicts(
                f"""
                SELECT MAX(business_date) AS business_date
                FROM {s.table(table)}
                WHERE region_code = '{rc}'
                """
            )
            if rows and rows[0].get("business_date") is not None:
                return _date_str(rows[0]["business_date"])
        except Exception:
            log.exception("Failed resolving business_date from %s", table)
    return date.today().isoformat()


def connection_info() -> dict[str, Any]:
    s = get_settings()
    return {
        "useUnityCatalog": s.use_unity_catalog,
        "catalog": s.catalog,
        "schema": s.schema,
        "warehouseId": s.warehouse_id,
        "businessDate": _resolve_business_date(s),
        "businessDateMode": s.business_date,
        "regionCode": s.region_code,
        "regionName": s.region_name,
        "fqSchema": s.fq,
    }


def _filter_params(s) -> tuple[str, str]:
    """Return trusted (business_date, region_code) from config — not request input."""
    return _resolve_business_date(s), s.region_code


def fetch_app_settings() -> dict[str, Any] | None:
    s = get_settings()
    bd, rc = _filter_params(s)
    rows = query_dicts(
        f"""
        SELECT * FROM {s.table('app_settings')}
        WHERE business_date = DATE('{bd}') AND region_code = '{rc}'
        ORDER BY updated_at DESC
        LIMIT 1
        """
    )
    return rows[0] if rows else None


def fetch_machines() -> list[dict[str, Any]]:
    """Return Machine[] shape for Machine Tracking / Overview."""
    s = get_settings()
    bd, rc = _filter_params(s)
    snaps = query_dicts(
        f"""
        SELECT * FROM {s.table('machine_snapshot')}
        WHERE business_date = DATE('{bd}') AND region_code = '{rc}'
        ORDER BY machine_id
        """
    )
    flows = query_dicts(
        f"""
        SELECT machine_id, series_date, value_type,
               deposit_amount_thb, withdrawal_amount_thb, net_amount_thb
        FROM {s.table('machine_daily_flow')}
        WHERE business_date = DATE('{bd}') AND region_code = '{rc}'
        ORDER BY machine_id, series_date, value_type
        """
    )
    denoms = query_dicts(
        f"""
        SELECT machine_id, denomination_thb, predicted_mix_pct
        FROM {s.table('machine_denomination')}
        WHERE business_date = DATE('{bd}') AND region_code = '{rc}'
        """
    )

    flow_by: dict[str, list[dict[str, Any]]] = {}
    for r in flows:
        mid = r["machine_id"]
        # Prefer ACTUAL when both exist for same day; chart expects one point/day
        flow_by.setdefault(mid, []).append(r)

    denom_by: dict[str, dict[str, float]] = {}
    for r in denoms:
        mid = r["machine_id"]
        d = denom_by.setdefault(mid, {"b1000": 0, "b500": 0, "b100": 0, "b50": 0})
        key = {1000: "b1000", 500: "b500", 100: "b100", 50: "b50"}.get(_int(r["denomination_thb"]))
        if key:
            d[key] = _num(r["predicted_mix_pct"])

    out: list[dict[str, Any]] = []
    for m in snaps:
        mid = m["machine_id"]
        # Collapse flow: one row per series_date (ACTUAL preferred)
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
        out.append(
            {
                "id": mid,
                "location": m["location_name"],
                "district": m.get("district_name") or "",
                "lat": _num(m["latitude"]),
                "lng": _num(m["longitude"]),
                "currentCash": _num(m["actual_cash_d_minus_1"]),
                "predictedEod": _num(m["predicted_cash_d"]),
                "cashCapacity": _num(m["cash_capacity_thb"]),
                "confidence": _num(m.get("prediction_confidence"), 90),
                "action": _map_action(m.get("action_type")),
                "health": _map_health(m.get("health_status")),
                "riskLevel": _map_risk(m.get("risk_level")),
                "emergency": _bool(m.get("emergency_flag")),
                "depositToday": _num(m.get("deposit_amount_d")),
                "withdrawToday": _num(m.get("withdrawal_amount_d")),
                "denomination": denom_by.get(mid, {"b1000": 40, "b500": 30, "b100": 20, "b50": 10}),
                "trend": trend,
            }
        )
    return out


def fetch_branches() -> list[dict[str, Any]]:
    """Return BranchTrack[] + BranchInput-compatible fields for Branches page."""
    s = get_settings()
    bd, rc = _filter_params(s)
    snaps = query_dicts(
        f"""
        SELECT * FROM {s.table('branch_snapshot')}
        WHERE business_date = DATE('{bd}') AND region_code = '{rc}'
        ORDER BY is_depot DESC, branch_code
        """
    )
    flows = query_dicts(
        f"""
        SELECT branch_code, series_date, value_type,
               deposit_amount_thb, withdrawal_amount_thb, net_amount_thb
        FROM {s.table('branch_daily_flow')}
        WHERE business_date = DATE('{bd}') AND region_code = '{rc}'
        ORDER BY branch_code, series_date
        """
    )
    gaps = query_dicts(
        f"""
        SELECT branch_code, denomination_thb, surplus_shortfall_thb
        FROM {s.table('branch_denomination_gap')}
        WHERE business_date = DATE('{bd}') AND region_code = '{rc}'
        """
    )

    flow_by: dict[str, list] = {}
    for r in flows:
        flow_by.setdefault(r["branch_code"], []).append(r)

    gap_by: dict[str, dict[str, float]] = {}
    for r in gaps:
        code = r["branch_code"]
        d = gap_by.setdefault(code, {"b1000": 0, "b500": 0, "b100": 0, "b50": 0})
        key = {1000: "b1000", 500: "b500", 100: "b100", 50: "b50"}.get(_int(r["denomination_thb"]))
        if key:
            d[key] = _num(r["surplus_shortfall_thb"])

    out: list[dict[str, Any]] = []
    for b in snaps:
        if _bool(b.get("is_depot")):
            continue
        code = b["branch_code"]
        by_day: dict[str, dict] = {}
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
        out.append(
            {
                "code": code,
                "name": b["branch_name"],
                "district": b.get("district_name") or "",
                "lat": _num(b["latitude"]),
                "lng": _num(b["longitude"]),
                "isDepot": False,
                "currentCash": _num(b["actual_cash_d_minus_1"]),
                "deposit": deposit,
                "withdraw": withdraw,
                "forecastNet": deposit - withdraw,
                "predictedCash": _num(b["predicted_cash_d"]),
                "cashCapacity": _num(b["cash_capacity_thb"]),
                "minThreshold": _num(b["minimum_threshold_thb"]),
                "openingCash": _num(b["actual_cash_d_minus_1"]),
                "predictedInflow": deposit,
                "predictedOutflow": withdraw,
                "action": _map_action(b.get("action_type")),
                "health": _map_health(b.get("health_status")),
                "confidence": _num(b.get("prediction_confidence"), 95),
                "emergency": _bool(b.get("emergency_flag")),
                "trend": trend,
                "denominationGap": gap_by.get(code, {"b1000": 0, "b500": 0, "b100": 0, "b50": 0}),
                "serviceMinutes": _int(b.get("service_minutes"), 20),
                "windowStart": b.get("window_start") or "08:00",
                "windowEnd": b.get("window_end") or "17:00",
            }
        )
    return out


def fetch_branch_inputs_for_config() -> list[dict[str, Any]]:
    """BranchInput[] including depot for Configure / Optimization."""
    s = get_settings()
    bd, rc = _filter_params(s)
    snaps = query_dicts(
        f"""
        SELECT * FROM {s.table('branch_snapshot')}
        WHERE business_date = DATE('{bd}') AND region_code = '{rc}'
        ORDER BY is_depot DESC, branch_code
        """
    )
    out = []
    for b in snaps:
        out.append(
            {
                "code": b["branch_code"],
                "name": b["branch_name"],
                "district": b.get("district_name") or "",
                "lat": _num(b["latitude"]),
                "lng": _num(b["longitude"]),
                "isDepot": _bool(b.get("is_depot")),
                "cashCapacity": _num(b["cash_capacity_thb"]),
                "minThreshold": _num(b["minimum_threshold_thb"]),
                "openingCash": _num(b["actual_cash_d_minus_1"]),
                "predictedInflow": _num(b["predicted_deposit_d"]),
                "predictedOutflow": _num(b["predicted_withdrawal_d"]),
                "serviceMinutes": _int(b.get("service_minutes")) or None,
                "windowStart": b.get("window_start") or "08:00",
                "windowEnd": b.get("window_end") or "17:00",
            }
        )
    return out


def fetch_routes(plan_type: str | None = None) -> list[dict[str, Any]]:
    """Return RouteExecution[] for Route Tracking / Truck Detail."""
    s = get_settings()
    bd, rc = _filter_params(s)
    plan_filter = ""
    if plan_type:
        pt = plan_type.upper().replace("'", "")
        plan_filter = f"AND route_plan_type = '{pt}'"

    summaries = query_dicts(
        f"""
        SELECT * FROM {s.table('route_summary')}
        WHERE business_date = DATE('{bd}') AND region_code = '{rc}'
        {plan_filter}
        ORDER BY route_id, route_plan_type
        """
    )
    stops = query_dicts(
        f"""
        SELECT * FROM {s.table('route_stops')}
        WHERE business_date = DATE('{bd}') AND region_code = '{rc}'
        {plan_filter}
        ORDER BY route_id, route_plan_type, stop_sequence
        """
    )

    stops_by: dict[tuple[str, str], list] = {}
    for st in stops:
        key = (st["route_id"], str(st["route_plan_type"]).upper())
        stops_by.setdefault(key, []).append(st)

    # Prefer OPTIMIZED for the live tracking list; keep ACTUAL as sibling if needed
    preferred = [r for r in summaries if str(r["route_plan_type"]).upper() == "OPTIMIZED"]
    if not preferred:
        preferred = summaries

    # If caller asked for a specific plan type, use that set
    if plan_type:
        preferred = summaries

    out: list[dict[str, Any]] = []
    for r in preferred:
        key = (r["route_id"], str(r["route_plan_type"]).upper())
        stop_rows = stops_by.get(key, [])
        stop_list = []
        path: list[list[float]] = []
        for st in stop_rows:
            lat, lng = _num(st["latitude"]), _num(st["longitude"])
            path.append([lat, lng])
            stop_list.append(
                {
                    "seq": _int(st["stop_sequence"]),
                    "code": st["stop_code"],
                    "location": st["stop_name"],
                    "type": _STOP_TYPE_UI.get(str(st["stop_type"]).upper(), st["stop_type"]),
                    "status": _STOP_STATUS_UI.get(
                        str(st["stop_status"]).upper().replace(" ", "_"), st["stop_status"]
                    ),
                    "eta": st.get("eta") or "",
                    "lat": lat,
                    "lng": lng,
                    "amount": _num(st.get("amount_thb")),
                }
            )
        status_key = str(r.get("route_status") or "").upper().replace(" ", "_")
        out.append(
            {
                "routeId": r["route_id"],
                "truckId": r["truck_id"],
                "label": r.get("route_label") or r["route_id"],
                "status": _ROUTE_STATUS_UI.get(status_key, r.get("route_status") or "On Track"),
                "depot": r.get("depot_name") or "",
                "depotLat": _num(r["depot_latitude"]),
                "depotLng": _num(r["depot_longitude"]),
                "totalStops": _int(r["total_stops"]),
                "completed": _int(r["completed_stops"]),
                "remaining": _int(r["remaining_stops"]),
                "distanceKm": _num(r["total_distance_km"]),
                "distanceLeftKm": _num(r.get("distance_left_km")),
                "etaReturn": r.get("eta_return") or "",
                "vehicleCapacity": _num(r["vehicle_capacity_thb"]),
                "cashOnBoard": _num(r.get("cash_on_board_thb")),
                "pickupAmount": _num(r.get("pickup_amount_thb")),
                "deliveryAmount": _num(r.get("delivery_amount_thb")),
                "color": r.get("route_color_hex") or "#22c55e",
                "path": path,
                "stops": stop_list,
                "planType": str(r["route_plan_type"]).upper(),
                "utilizationPct": _num(r.get("vehicle_utilization_pct")),
                "citCostThb": _num(r.get("cit_cost_thb")),
                "slaPct": _num(r.get("sla_achievement_pct"), 98.6),
            }
        )
    return out


def fetch_plan_bundle() -> dict[str, Any]:
    """Optimization plan: prefer mock solver seeded from UC branch cash when available."""
    s = get_settings()
    try:
        branch_inputs = fetch_branch_inputs_for_config()
        if not branch_inputs:
            return build_plan()
        plan = build_plan()
        # Overlay UC branch cash onto the plan branches so KPIs reflect warehouse data
        by_code = {b["code"]: b for b in branch_inputs}
        for b in plan["branches"]:
            src = by_code.get(b["code"])
            if not src:
                continue
            b["openingCash"] = src["openingCash"]
            b["cashCapacity"] = src["cashCapacity"]
            b["minThreshold"] = src["minThreshold"]
            b["predictedInflow"] = src["predictedInflow"]
            b["predictedOutflow"] = src["predictedOutflow"]
            b["netFlow"] = src["predictedInflow"] - src["predictedOutflow"]
            b["projectedClosingCash"] = src["openingCash"] + b["netFlow"]
        plan["planDate"] = s.business_date
        plan["region"] = s.region_name
        plan["dataSource"] = "unity_catalog"
        return plan
    except Exception:
        log.exception("UC plan build failed; using mock")
        return build_plan()
