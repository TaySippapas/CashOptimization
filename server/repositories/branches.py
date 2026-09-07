"""Branch snapshots, tracking data, and planner inputs."""
from __future__ import annotations

from typing import Any

from server.mappers.common import _bool, _date_str, _day_label, _int, _map_action, _map_health, _num
from server.repositories.common import _resolve_date, _t
from server.warehouse import cached, connection, query, query_many


def fetch_branches(business_date: str | None = None) -> list[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cur:
            d = _resolve_date(cur, business_date)
            return query(
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


_DENOM_KEY = {1000: "b1000", 500: "b500", 100: "b100", 50: "b50"}


@cached
def fetch_branch_tracks(business_date: str | None = None) -> tuple[str, list[dict[str, Any]]]:
    """BranchTrack[] shape (excludes the depot, matching uc_repo.fetch_branches).
    Returns (resolved_business_date, rows) — avoids a second connection just
    to report the date in the API response envelope."""
    with connection() as conn:
        with conn.cursor() as cur:
            d = _resolve_date(cur, business_date)

    # Independent of each other — issued together rather than back to back.
    snaps, flows, gaps = query_many([
        (f"""
                SELECT b.branch_code, b.branch_name, b.district_name, b.latitude, b.longitude,
                       b.cash_capacity_thb, b.min_threshold_thb, b.service_minutes, b.window_start, b.window_end,
                       p.actual_cash_d_minus_1, p.predicted_cash_d, p.predicted_deposit_d, p.predicted_withdrawal_d,
                       p.action_type, p.health_status, p.emergency_flag,
                       p.delivery_amount_thb
                FROM {_t('dim_branch')} b
                JOIN {_t('fact_cash_position')} p ON p.branch_code = b.branch_code
                WHERE p.business_date = ?
                ORDER BY b.branch_code
        """, [d]),
        (f"""
                SELECT branch_code, series_date, value_type, deposit_amount_thb, withdrawal_amount_thb, net_amount_thb
                FROM {_t('fact_cash_flow_daily')}
                WHERE business_date = ?
                ORDER BY branch_code, series_date
        """, [d]),
        (f"""
                SELECT branch_code, denomination_thb, delivery_amount_thb,
                       actual_amount_thb_d_minus_1 AS actual_amount_thb
                FROM {_t('fact_branch_denomination')}
                WHERE business_date = ?
        """, [d]),
    ]).results

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


@cached
def fetch_branch_inputs(business_date: str | None = None) -> list[dict[str, Any]]:
    """BranchInput[] shape — for Configure Inputs."""
    with connection() as conn:
        with conn.cursor() as cur:
            d = _resolve_date(cur, business_date)
            snaps = query(
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
