"""Machine snapshots and tracking data."""
from __future__ import annotations

from typing import Any

from server.mappers.common import _bool, _date_str, _day_label, _int, _map_health, _num
from server.repositories.common import _latest_machine_date, _t, log
from server.repositories.health import health
from server.warehouse import cached, connection, query_many


def fetch_machines(business_date: str | None = None) -> list[dict[str, Any]]:
    # Machine tables not yet migrated to new schema — return empty
    # TODO: Implement with fact_machine_position when machine tables are ready
    log.info("fetch_machines: machine tables not yet available in new schema")
    return []


@cached
def fetch_machine_tracks(business_date: str | None = None) -> tuple[str, list[dict[str, Any]]]:
    """Machine[] shape (tracking.ts), including a denomination *mix* (predicted remaining).
    Returns (resolved_business_date, rows)."""
    with connection() as conn:
        with conn.cursor() as cur:
            d = business_date or _latest_machine_date(cur)
            if not d:
                return "", []

    # Position, trend and denomination are independent — issued together.
    snaps, flows, denoms = query_many([
        (f"""
                SELECT m.machine_id, m.machine_type, m.location_name, m.district_name, m.latitude, m.longitude,
                       m.alltime_max_cash_thb,
                       p.actual_cash_d_minus_1, p.predicted_cash_d, p.predicted_deposit_d,
                       p.predicted_withdrawal_d, p.action_type, p.health_status, p.emergency_flag,
                       p.delivery_amount_thb, p.remove_amount_thb
                FROM {_t('dim_machine')} m
                JOIN {_t('fact_machine_position')} p ON p.machine_id = m.machine_id
                WHERE p.business_date = ?
                ORDER BY m.machine_id
        """, [d]),
        (f"""
                SELECT machine_id, series_date, value_type, deposit_amount_thb,
                       withdrawal_amount_thb, net_amount_thb
                FROM {_t('fact_machine_flow_daily')}
                WHERE business_date = ?
                ORDER BY machine_id, series_date
        """, [d]),
        (f"""
                SELECT machine_id, denomination_thb,
                       actual_note_count_d_minus_1, actual_amount_thb_d_minus_1,
                       predicted_remaining_note_count, predicted_remaining_amount_thb,
                       alltime_max_note_count,
                       delivery_note_count, delivery_amount_thb,
                       remove_note_count, remove_amount_thb
                FROM {_t('fact_machine_denomination')}
                WHERE business_date = ?
        """, [d]),
    ]).results

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
        # Use predicted_remaining if available; fallback to actual (ATM has no per-denom forecast)
        dd = denom_mix_by.setdefault(mid, {"b1000": 0, "b500": 0, "b100": 0})
        dd[key] = _int(r["predicted_remaining_note_count"]) or _int(r["actual_note_count_d_minus_1"]) or 0
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
