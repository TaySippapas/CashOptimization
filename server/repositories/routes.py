"""Route summaries and execution stops."""
from __future__ import annotations

from typing import Any

from server.mappers.common import _ROUTE_STATUS_UI, _int, _num
from server.repositories.common import _resolve_route_date, _t
from server.warehouse import cached, connection, query


_ACTION_TO_UI_TYPE = {
    "START": "Start",
    "DELIVERY": "Deliver",
    "PICKUP": "Pickup",
    "SWAP": "Mixed",
    "BOTH": "Mixed",
    "RETURN": "Return",
}


_ROUTE_COLORS = [
    "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
    "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
    "#84cc16", "#d946ef", "#0ea5e9", "#facc15", "#a855f7", "#10b981",
]


def fetch_routes(business_date: str | None = None, plan_type: str | None = None) -> list[dict[str, Any]]:
    """Raw route data for debugging/admin. Returns summary + stops joined."""
    with connection() as conn:
        with conn.cursor() as cur:
            d = _resolve_route_date(cur, business_date)
            routes = query(
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
            stops = query(
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


@cached
def fetch_route_executions(
    business_date: str | None = None, plan_type: str | None = None
) -> tuple[str, list[dict[str, Any]]]:
    """RouteExecution[] shape for frontend consumption.

    Reads from fact_route_summary + fact_route_stop (new schema).
    Uses truck_id as the route identifier (routes are per-truck-per-day).
    Returns (resolved_business_date, rows).
    """
    with connection() as conn:
        with conn.cursor() as cur:
            d = _resolve_route_date(cur, business_date)
            if not d:
                return "", []

            routes = query(
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
            stops = query(
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
