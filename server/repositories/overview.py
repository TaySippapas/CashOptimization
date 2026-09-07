"""Cross-domain overview aggregates and period calculations."""
from __future__ import annotations

from datetime import date, timedelta

from server.mappers.common import _date_str, _int, _num
from server.repositories.common import _resolve_date, _resolve_route_date, _t
from server.warehouse import cached, connection, query_many


PERIOD_DAYS = {"day": 1, "week": 7, "month": 30, "quarter": 90, "year": 365}


def _shift_days(d: str | None, back: int) -> str | None:
    """Move an ISO date back by `back` days without a round trip."""
    if not d:
        return d
    return (date.fromisoformat(str(d)[:10]) - timedelta(days=back)).isoformat()


@cached
def fetch_overview_summary(
    business_date: str | None = None, period: str = "day"
) -> dict:
    """Cross-domain overview: demand (prediction) vs plan (route), coverage, CIT cost.

    Covers `period` days ending at the selected date. Metrics are rolled up per
    day first, then combined with the function that suits the measure:

      * stocks   (cash held, entity counts) -> AVG per day. Summing these
        across days multiplies the balance by the number of days.
      * flows    (cash moved, cost, distance, stops) -> SUM across the period.
      * rates    (utilisation, SLA) -> AVG.

    Before this took a date at all, every aggregate ran over the whole table,
    so "Total Cash Under Management" grew with each day of history loaded.
    """
    days = PERIOD_DAYS.get(period, 1)
    with connection() as conn:
        with conn.cursor() as cur:
            d = _resolve_date(cur, business_date)
            rd = _resolve_route_date(cur, business_date)
    # Inclusive window, so "day" is a single date. Computed locally —
    # asking the warehouse to subtract days cost two round trips.
    start = _shift_days(d, days - 1)
    rstart = _shift_days(rd, days - 1)

    # The six aggregates below are independent of each other, so they go out
    # concurrently instead of queueing on a single cursor.
    fan = query_many([
        # --- Demand: Branch predictions ---
        (f"""
                SELECT action_type,
                       COALESCE(AVG(daily_cnt), 0) AS cnt,
                       COALESCE(SUM(daily_delivery), 0) AS delivery_amt,
                       COALESCE(AVG(daily_actual), 0) AS total_actual,
                       COALESCE(AVG(daily_predicted), 0) AS total_predicted,
                       COALESCE(SUM(daily_cof), 0) AS total_cof,
                       MAX(biz_date) AS biz_date
                FROM (
                    SELECT business_date AS biz_date, action_type,
                           COUNT(*) AS daily_cnt,
                           SUM(delivery_amount_thb) AS daily_delivery,
                           SUM(actual_cash_d_minus_1) AS daily_actual,
                           SUM(predicted_cash_d) AS daily_predicted,
                           SUM(cost_of_fund_thb) AS daily_cof
                    FROM {_t('fact_cash_position')}
                    WHERE business_date BETWEEN ? AND ?
                    GROUP BY business_date, action_type
                )
                GROUP BY action_type
        """, [start, d]),

        # --- Demand: Machine predictions ---
        (f"""
                SELECT action_type,
                       COALESCE(AVG(daily_cnt), 0) AS cnt,
                       COALESCE(SUM(daily_delivery), 0) AS delivery_amt,
                       COALESCE(AVG(daily_actual), 0) AS total_actual,
                       COALESCE(AVG(daily_predicted), 0) AS total_predicted,
                       COALESCE(SUM(daily_cof), 0) AS total_cof,
                       MAX(biz_date) AS biz_date
                FROM (
                    SELECT business_date AS biz_date, action_type,
                           COUNT(*) AS daily_cnt,
                           SUM(delivery_amount_thb) AS daily_delivery,
                           SUM(actual_cash_d_minus_1) AS daily_actual,
                           SUM(predicted_cash_d) AS daily_predicted,
                           SUM(cost_of_fund_thb) AS daily_cof
                    FROM {_t('fact_machine_position')}
                    WHERE business_date BETWEEN ? AND ?
                    GROUP BY business_date, action_type
                )
                GROUP BY action_type
        """, [start, d]),

        # --- Plan: Route summary aggregate ---
        # One row per truck per day already, so SUM spans the window for
        # flows while trucks needs DISTINCT (else it counts truck-days).
        (f"""
                SELECT COUNT(DISTINCT truck_id) AS trucks,
                       COALESCE(SUM(total_stops), 0) AS total_stops,
                       COALESCE(SUM(total_distance_km), 0) AS total_km,
                       COALESCE(SUM(total_duration_minutes), 0) AS total_minutes,
                       COALESCE(AVG(total_duration_minutes), 0) AS avg_minutes,
                       COALESCE(MAX(total_duration_minutes), 0) AS max_minutes,
                       SUM(CASE WHEN total_duration_minutes > 480 THEN 1 ELSE 0 END) AS ot_trucks,
                       COALESCE(SUM(cost_of_transport), 0) AS total_cot,
                       COALESCE(SUM(delivery_amount_thb_branch), 0) AS delivery_branch,
                       COALESCE(SUM(delivery_amount_thb_machine), 0) AS delivery_machine,
                       COALESCE(AVG(vehicle_utilization_pct), 0) AS avg_util,
                       COALESCE(AVG(sla_achievement_pct), 0) AS avg_sla,
                       MAX(business_date) AS biz_date
                FROM {_t('fact_route_summary')}
                WHERE business_date BETWEEN ? AND ?
        """, [rstart, rd]),

        # --- Plan: Stop breakdown by type ---
        (f"""
                SELECT stop_type, COUNT(*) AS cnt, COUNT(DISTINCT stop_code) AS distinct_codes
                FROM {_t('fact_route_stop')}
                WHERE business_date BETWEEN ? AND ?
                  AND action_type != 'START' AND action_type != 'RETURN'
                GROUP BY stop_type
        """, [rstart, rd]),

        # --- Coverage: Branch matching (KT prefix) ---
        (f"""
                WITH predicted AS (
                    SELECT DISTINCT branch_code
                    FROM {_t('fact_cash_position')}
                    WHERE action_type = 'DELIVERY' AND business_date BETWEEN ? AND ?
                ),
                planned AS (
                    SELECT DISTINCT stop_code
                    FROM {_t('fact_route_stop')}
                    WHERE stop_type = 'Branch' AND business_date BETWEEN ? AND ?
                )
                SELECT
                    (SELECT COUNT(*) FROM predicted) AS demand,
                    (SELECT COUNT(*) FROM planned) AS planned,
                    (SELECT COUNT(*) FROM predicted p
                     WHERE EXISTS (
                       SELECT 1 FROM planned r
                       WHERE r.stop_code LIKE CONCAT('%KT', p.branch_code, '%')
                     )) AS covered
        """, [start, d, rstart, rd]),

        # --- Coverage: Machine matching (direct code) ---
        (f"""
                WITH predicted AS (
                    SELECT DISTINCT machine_id
                    FROM {_t('fact_machine_position')}
                    WHERE action_type != 'No Action' AND business_date BETWEEN ? AND ?
                ),
                planned AS (
                    SELECT DISTINCT stop_code
                    FROM {_t('fact_route_stop')}
                    WHERE stop_type IN ('ATM', 'RCM', '3IN1') AND business_date BETWEEN ? AND ?
                )
                SELECT
                    (SELECT COUNT(*) FROM predicted) AS demand,
                    (SELECT COUNT(*) FROM planned) AS planned,
                    (SELECT COUNT(*) FROM predicted p
                     WHERE EXISTS (
                       SELECT 1 FROM planned r
                       WHERE r.stop_code LIKE CONCAT('%', p.machine_id, '%')
                     )) AS covered
        """, [start, d, rstart, rd]),
    ])
    (br_demand, mc_demand, plan_agg, stop_types, br_coverage, mc_coverage) = fan.results

    # --- Assemble response ---
    def _by_action(rows, action):
        for r in rows:
            if r.get("action_type") == action:
                return r
        return {}

    def _sum_field(rows, field):
        return sum(_num(r.get(field)) for r in rows)

    br_delivery = _by_action(br_demand, "DELIVERY")
    br_no_action = _by_action(br_demand, "NO_ACTION")
    mc_service = [r for r in mc_demand if r.get("action_type") != "No Action"]
    mc_no_action = _by_action(mc_demand, "No Action")

    pa = plan_agg[0] if plan_agg else {}
    bc = br_coverage[0] if br_coverage else {}
    mc = mc_coverage[0] if mc_coverage else {}

    stop_map = {r["stop_type"]: {"count": _int(r["cnt"]), "distinct": _int(r["distinct_codes"])} for r in stop_types}

    total_actual_cash = _num(_sum_field(br_demand, "total_actual")) + _num(_sum_field(mc_demand, "total_actual"))
    total_cof = _num(_sum_field(br_demand, "total_cof")) + _num(_sum_field(mc_demand, "total_cof"))
    total_cot = _num(pa.get("total_cot"))

    return {
        "demand": {
            "branch": {
                "total": _int(_sum_field(br_demand, "cnt")),
                "needService": _int(br_delivery.get("cnt")),
                "deliveryAmount": _num(br_delivery.get("delivery_amt")),
                "totalActualCash": _num(_sum_field(br_demand, "total_actual")),
                "businessDate": _date_str(br_delivery.get("biz_date") or br_no_action.get("biz_date")),
            },
            "machine": {
                "total": _int(_sum_field(mc_demand, "cnt")),
                "needService": sum(_int(r.get("cnt")) for r in mc_service),
                "serviceBreakdown": [
                    {"action": r.get("action_type", ""), "count": _int(r.get("cnt"))}
                    for r in mc_service
                ],
                "totalActualCash": _num(_sum_field(mc_demand, "total_actual")),
                "businessDate": _date_str(mc_no_action.get("biz_date") or (mc_service[0].get("biz_date") if mc_service else "")),
            },
        },
        "plan": {
            "trucks": _int(pa.get("trucks")),
            "totalStops": _int(pa.get("total_stops")),
            "totalDistanceKm": round(_num(pa.get("total_km")), 1),
            "totalDurationMinutes": round(_num(pa.get("total_minutes")), 0),
            "avgDurationMinutes": round(_num(pa.get("avg_minutes")), 0),
            "maxDurationMinutes": round(_num(pa.get("max_minutes")), 0),
            "otTrucks": _int(pa.get("ot_trucks")),
            "deliveryAmountBranch": _num(pa.get("delivery_branch")),
            "deliveryAmountMachine": _num(pa.get("delivery_machine")),
            "avgUtilizationPct": round(_num(pa.get("avg_util")), 1),
            "avgSlaPct": round(_num(pa.get("avg_sla")), 1),
            "stopsByType": stop_map,
            "businessDate": _date_str(pa.get("biz_date")),
        },
        "coverage": {
            "branch": {
                "demand": _int(bc.get("demand")),
                "planned": _int(bc.get("planned")),
                "covered": _int(bc.get("covered")),
                "unserved": _int(bc.get("demand")) - _int(bc.get("covered")),
                "extra": _int(bc.get("planned")) - _int(bc.get("covered")),
            },
            "machine": {
                "demand": _int(mc.get("demand")),
                "planned": _int(mc.get("planned")),
                "covered": _int(mc.get("covered")),
                "unserved": _int(mc.get("demand")) - _int(mc.get("covered")),
                "extra": _int(mc.get("planned")) - _int(mc.get("covered")),
            },
        },
        "cost": {
            "cot": total_cot,
            "cof": total_cof if total_cof else None,
            "citTotal": total_cot + total_cof,
        },
        "cashUnderManagement": total_actual_cash,
        # What the figures actually cover, so the UI can label them honestly.
        "period": period,
        "periodDays": days,
        "periodStart": _date_str(start),
        "periodEnd": _date_str(d),
        # One failed aggregate leaves the other five usable, but the tiles it
        # fed would silently read as zero — so say which ones are missing
        # rather than letting a gap look like a real number.
        "partial": not fan.ok,
        "failedAggregates": [
            name for name, err in zip(
                ("branchDemand", "machineDemand", "plan", "stopTypes",
                 "branchCoverage", "machineCoverage"),
                fan.errors,
            ) if err
        ],
    }
