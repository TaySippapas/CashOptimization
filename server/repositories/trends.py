"""Daily dataset trends with explicit rollups, coverage and comparable periods."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from server.mappers.common import _date_str
from server.repositories.common import _t
from server.repositories.health import fetch_date_range
from server.warehouse import cached, connection, query

PERIOD_DAYS = {"3days": 3, "week": 7, "month": 30, "quarter": 90, "year": 365}


def metric(key, label, group, unit="THB", rollup="sum", *, numerator=None, denominator=None, scale=100, note=""):
    return dict(key=key, label=label, group=group, unit=unit, rollup=rollup,
                numerator=numerator, denominator=denominator, scale=scale, note=note)


def metrics_for(dataset: str) -> list[dict]:
    if dataset == "routes":
        return [
            metric("entities", "Active trucks", "Activity", "count", "average"),
            metric("stops", "Planned service stops", "Activity", "count"),
            metric("completed", "Recorded completed stops", "Activity", "count"),
            metric("remaining", "Recorded remaining stops", "Activity", "count"),
            metric("distance", "Planned distance", "Distance", "km"),
            metric("duration", "Planned duration", "Time", "hours"),
            metric("normalHours", "Normal hours", "Time", "hours"),
            metric("otHours", "Overtime hours", "Time", "hours"),
            *[metric(k, label, "Transport costs") for k, label in [
                ("transportCost", "Transport cost"), ("citCost", "Recorded CIT cost"),
                ("fuel", "Fuel"), ("repair", "Repair"), ("maintenance", "Maintenance"),
                ("normalWage", "Normal wages"), ("otWage", "Overtime wages")]],
            *[metric(k, label, "Planned cash movements") for k, label in [
                ("deliveryBranch", "Branch delivery"), ("deliveryMachine", "Machine delivery"), ("pickup", "Branch pickup")]],
            metric("utilization", "Capacity-weighted utilization", "Rates", "%", "ratio", numerator="_load", denominator="_capacity",
                   note="Stored route utilization weighted by vehicle capacity across route-days."),
            metric("completion", "Recorded completion rate", "Rates", "%", "ratio", numerator="completed", denominator="stops",
                   note="Recorded completed service stops / planned service stops. These are optimized-plan snapshots."),
            metric("sla", "Mean reported SLA", "Reported SLA", "%", "ratio", numerator="_slaTotal", denominator="_slaCount", scale=1,
                   note="Arithmetic mean of stored route SLA percentages; not a fleet-wide on-time rate."),
            metric("costPerKm", "Transport cost per km", "Unit cost", "THB/km", "ratio", numerator="transportCost", denominator="distance", scale=1),
        ]
    values = [
        metric("entities", "Entities with snapshots", "Data coverage", "count", "average"),
        metric("actualEntities", "Entities with actual flow", "Data coverage", "count", "average"),
        metric("openingCash", "Opening cash (d−1)", "Cash balances", rollup="average", note="Average daily total opening balance, shown against the planning date."),
        metric("predictedCash", "Predicted closing cash", "Cash balances", rollup="average"),
        *[metric(k, label, "Actual cash flow") for k, label in [
            ("actualDeposit", "Actual deposits"), ("actualWithdrawal", "Actual withdrawals"), ("actualNet", "Actual net flow")]],
        *[metric(k, label, "Planning forecasts") for k, label in [
            ("forecastDeposit", "Forecast deposits"), ("forecastWithdrawal", "Forecast withdrawals"), ("forecastNet", "Forecast net flow")]],
        metric("delivery", "Planned cash delivery", "Planned cash movements"),
        metric("costOfFund", "Cost of funds", "Cost of funds"),
        *[metric(k, label, "Health", "count", "average") for k, label in [
            ("healthy", "Healthy"), ("watch", "Watch"), ("actionNeeded", "Action needed"), ("critical", "Critical"), ("noData", "No data / unknown")]],
        *[metric(k, label, "Service demand", "count", "average") for k, label in [
            ("deliveryCount", "Delivery actions"), ("pickupCount", "Pickup actions"), ("bothCount", "Both actions"), ("noActionCount", "No action"), ("emergencies", "Emergencies")]],
        metric("utilization", "Cash utilization", "Rates", "%", "ratio", numerator="openingCash", denominator="_capacity",
               note="Total opening cash / total capacity across entity-days. Capacity comes from the current master data."),
        metric("serviceRate", "Service required", "Rates", "%", "ratio", numerator="_service", denominator="entities"),
        metric("emergencyRate", "Emergency rate", "Rates", "%", "ratio", numerator="emergencies", denominator="entities"),
        metric("healthyRate", "Healthy share", "Rates", "%", "ratio", numerator="healthy", denominator="entities"),
    ]
    if dataset == "machines":
        values.append(metric("remove", "Planned cash removal", "Planned cash movements"))
    for denomination in ([1000, 500, 100, 50] if dataset == "branches" else [1000, 500, 100]):
        values.extend([
            metric(f"denom{denomination}", f"฿{denomination:,} notes: value", "Denomination balances", rollup="average"),
            metric(f"mix{denomination}", f"฿{denomination:,} share", "Denomination mix", "%", "ratio", numerator=f"denom{denomination}", denominator="_denomTotal",
                   note="Share of actual denomination value in THB, not share of note count."),
        ])
    return values


def _sum(expression: str, alias: str) -> str:
    # A null amount is unknown, not zero. Don't silently present partial totals.
    return f"CASE WHEN COUNT({expression}) = COUNT(*) THEN SUM({expression}) END AS {alias}"


def _position_sql(dataset: str) -> str:
    branch = dataset == "branches"
    entity = "branch_code" if branch else "machine_id"
    table = "fact_cash_position" if branch else "fact_machine_position"
    dim = "dim_branch" if branch else "dim_machine"
    capacity = "cash_capacity_thb" if branch else "alltime_max_cash_thb"
    amounts = {"openingCash": "p.actual_cash_d_minus_1", "predictedCash": "p.predicted_cash_d",
               "forecastDeposit": "p.predicted_deposit_d", "forecastWithdrawal": "p.predicted_withdrawal_d",
               "forecastNet": "p.predicted_deposit_d-p.predicted_withdrawal_d", "delivery": "p.delivery_amount_thb",
               "costOfFund": "p.cost_of_fund_thb", "_capacity": f"CASE WHEN d.{capacity}>0 THEN d.{capacity} END"}
    if not branch:
        amounts["remove"] = "p.remove_amount_thb"
    columns = [_sum(expr, alias) for alias, expr in amounts.items()]
    action = "UPPER(REPLACE(p.action_type, ' ', '_'))"
    delivery = f"{action} IN ('DELIVERY','SWAP_(NEAR_EMPTY)')"
    pickup = f"{action} IN ('PICKUP','SWAP_(NEAR_FULL)')"
    both = f"{action}='BOTH'"
    for alias, condition in [("deliveryCount", delivery), ("pickupCount", pickup), ("bothCount", both),
                             ("noActionCount", f"{action}='NO_ACTION'"), ("_service", f"({delivery} OR {pickup} OR {both})")]:
        columns.append(f"CASE WHEN COUNT(p.action_type)=COUNT(*) THEN COUNT_IF({condition}) END AS {alias}")
    for alias, status in [("healthy", "HEALTHY"), ("watch", "WATCH"), ("actionNeeded", "ACTION_NEEDED"), ("critical", "CRITICAL")]:
        columns.append(f"COUNT_IF(UPPER(p.health_status)='{status}') AS {alias}")
    columns.extend(["COUNT_IF(p.health_status IS NULL OR UPPER(p.health_status) NOT IN ('HEALTHY','WATCH','ACTION_NEEDED','CRITICAL')) AS noData",
                    "CASE WHEN COUNT(p.emergency_flag)=COUNT(*) THEN COUNT_IF(p.emergency_flag) END AS emergencies"])
    return f"""WITH ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY business_date,{entity} ORDER BY updated_at DESC) rn
        FROM {_t(table)} WHERE business_date BETWEEN ? AND ?
    ) SELECT p.business_date AS date,COUNT(*) AS entities,{','.join(columns)}
      FROM ranked p LEFT JOIN {_t(dim)} d ON d.{entity}=p.{entity}
      WHERE p.rn=1 GROUP BY p.business_date ORDER BY p.business_date"""


def _flow_sql(dataset: str) -> str:
    entity = "branch_code" if dataset == "branches" else "machine_id"
    table = "fact_cash_flow_daily" if dataset == "branches" else "fact_machine_flow_daily"
    cols = [_sum(expr, alias) for expr, alias in [("deposit_amount_thb", "actualDeposit"),
            ("withdrawal_amount_thb", "actualWithdrawal"), ("net_amount_thb", "actualNet")]]
    return f"""WITH ranked AS (
      SELECT *,ROW_NUMBER() OVER (PARTITION BY {entity},series_date ORDER BY business_date DESC,updated_at DESC) rn
      FROM {_t(table)} WHERE value_type='ACTUAL' AND business_date<=? AND series_date BETWEEN ? AND ?
    ) SELECT series_date AS date,COUNT(*) AS actualEntities,{','.join(cols)}
      FROM ranked WHERE rn=1 GROUP BY series_date ORDER BY series_date"""


def _denom_sql(dataset: str) -> str:
    branch = dataset == "branches"
    table = "fact_branch_denomination" if branch else "fact_machine_denomination"
    entity = "branch_code" if branch else "machine_id"
    denoms = [1000, 500, 100, 50] if branch else [1000, 500, 100]
    cols = [f"CASE WHEN COUNT_IF(denomination_thb={d} AND actual_amount_thb_d_minus_1 IS NOT NULL)=COUNT(DISTINCT {entity}) THEN SUM(CASE WHEN denomination_thb={d} THEN actual_amount_thb_d_minus_1 END) END AS denom{d}" for d in denoms]
    return f"""WITH ranked AS (
      SELECT *,ROW_NUMBER() OVER (PARTITION BY business_date,{entity},denomination_thb ORDER BY updated_at DESC) rn
      FROM {_t(table)} WHERE business_date BETWEEN ? AND ?
    ) SELECT business_date AS date,COUNT(DISTINCT {entity}) AS _denomEntities,{','.join(cols)}
      FROM ranked WHERE rn=1 GROUP BY business_date ORDER BY business_date"""


def _route_sql() -> str:
    fields = {"stops": "total_stops", "completed": "completed_stops", "remaining": "remaining_stops", "distance": "total_distance_km",
              "duration": "total_duration_minutes/60.0", "normalHours": "normal_hours", "otHours": "ot_hours",
              "transportCost": "cost_of_transport", "citCost": "cit_cost_thb", "fuel": "fuel_cost_thb", "repair": "repair_cost_thb",
              "maintenance": "maintenance_cost_thb", "normalWage": "normal_wage_thb", "otWage": "ot_wage_thb",
              "deliveryBranch": "delivery_amount_thb_branch", "deliveryMachine": "delivery_amount_thb_machine", "pickup": "pickup_amount_thb_branch",
              "_capacity": "CASE WHEN vehicle_capacity_thb>0 THEN vehicle_capacity_thb END",
              "_load": "CASE WHEN vehicle_capacity_thb>0 THEN vehicle_capacity_thb*vehicle_utilization_pct/100.0 END",
              "_slaTotal": "sla_achievement_pct"}
    return f"""WITH ranked AS (
      SELECT *,ROW_NUMBER() OVER (PARTITION BY business_date,truck_id ORDER BY plan_version DESC,updated_at DESC) rn
      FROM {_t('fact_route_summary')} WHERE route_plan_type='OPTIMIZED' AND business_date BETWEEN ? AND ?
    ) SELECT business_date AS date,COUNT(*) AS entities,COUNT(sla_achievement_pct) AS _slaCount,
      {','.join(_sum(expr, alias) for alias,expr in fields.items())}
      FROM ranked WHERE rn=1 GROUP BY business_date ORDER BY business_date"""


def rollup(rows: list[dict], definition: dict) -> tuple[float | None, int]:
    if definition["rollup"] == "ratio":
        pairs = [(r.get(definition["numerator"]), r.get(definition["denominator"])) for r in rows]
        valid = [(float(n), float(d)) for n, d in pairs if n is not None and d is not None and d > 0]
        if not valid:
            return None, 0
        return sum(n for n, _ in valid) / sum(d for _, d in valid) * definition["scale"], len(valid)
    values = [float(r[definition["key"]]) for r in rows if r.get(definition["key"]) is not None]
    if not values:
        return None, 0
    total = sum(values)
    return (total / len(values) if definition["rollup"] == "average" else total), len(values)


def assemble(dataset: str, period: str, end: date, daily: list[dict], available: dict) -> dict:
    days = PERIOD_DAYS[period]
    start = end - timedelta(days=days - 1)
    previous_start, previous_end = start - timedelta(days=days), start - timedelta(days=1)
    definitions = metrics_for(dataset)
    by_date = {_date_str(r["date"]): {k: float(v) if v is not None and k != "date" else v for k,v in r.items()} for r in daily}
    current, previous, points = [], [], []
    for i in range(days * 2):
        day = previous_start + timedelta(days=i)
        raw = by_date.get(day.isoformat(), {})
        (current if day >= start else previous).append(raw)
        if day >= start:
            points.append({"date": day.isoformat(), **{m["key"]: rollup([raw], m)[0] for m in definitions}})
    summaries = []
    for m in definitions:
        value, covered = rollup(current, m)
        prior, prior_covered = rollup(previous, m)
        change = None
        if covered == days and prior_covered == days and value is not None and prior is not None:
            if m["unit"] == "%":
                change = value - prior
            elif prior > 0:
                change = (value - prior) / prior * 100
        summaries.append({**m, "value": value, "previousValue": prior, "change": change,
                          "changeUnit": "pp" if m["unit"] == "%" else "%", "coveredDays": covered, "previousCoveredDays": prior_covered})
    return {"dataset": dataset, "period": period, "periodDays": days, "start": start.isoformat(), "end": end.isoformat(),
            "previousStart": previous_start.isoformat(), "previousEnd": previous_end.isoformat(),
            "availableStart": available.get("minDate"), "availableEnd": available.get("maxDate"),
            "coveredDays": sum(r.get("entities") is not None for r in current), "metrics": summaries, "points": points}


@cached
def fetch_trends(dataset: str, period: str = "week", end_date: str | None = None) -> dict[str, Any]:
    if dataset not in {"branches", "machines", "routes"} or period not in PERIOD_DAYS:
        raise ValueError("Unsupported dataset or period")
    available = fetch_date_range(dataset)
    end = date.fromisoformat(end_date or available["maxDate"]) if end_date or available["maxDate"] else date.today()
    lower = end - timedelta(days=2 * PERIOD_DAYS[period] - 1)
    if not available["dates"]:
        return assemble(dataset, period, end, [], available)
    with connection() as conn:
        with conn.cursor() as cur:
            daily = query(cur, _route_sql() if dataset == "routes" else _position_sql(dataset), [lower.isoformat(), end.isoformat()])
            if dataset != "routes":
                flows = query(cur, _flow_sql(dataset), [end.isoformat(), lower.isoformat(), end.isoformat()])
                denoms = query(cur, _denom_sql(dataset), [lower.isoformat(), end.isoformat()])
                combined = {_date_str(r["date"]): r for r in daily}
                for r in flows + denoms:
                    combined.setdefault(_date_str(r["date"]), {"date": r["date"]}).update(r)
                for row in combined.values():
                    keys = [f"denom{d}" for d in ([1000, 500, 100, 50] if dataset == "branches" else [1000, 500, 100])]
                    if row.get("_denomEntities") != row.get("entities"):
                        for key in keys:
                            row[key] = None
                    row["_denomTotal"] = sum(row[k] for k in keys) if all(row.get(k) is not None for k in keys) else None
                daily = list(combined.values())
    return assemble(dataset, period, end, daily, available)
