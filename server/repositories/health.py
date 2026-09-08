"""Warehouse health and available business dates."""
from __future__ import annotations

from typing import Any

from server.mappers.common import _date_str
from server.repositories.common import CATALOG, SCHEMA, _t, latest_business_date
from server.warehouse import WAREHOUSE_ID, cached, connection, query


@cached
def health() -> dict[str, Any]:
    # Resolving the business date already proves the warehouse answers, so the
    # separate SELECT 1 probe was a wasted round trip on every page load.
    with connection() as conn:
        with conn.cursor() as cur:
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


@cached
def fetch_date_range(dataset: str = "branches") -> dict[str, Any]:
    """Exact available days for one tracking dataset, including gaps."""
    table = {
        "branches": "fact_cash_position",
        "machines": "fact_machine_position",
        "routes": "fact_route_summary",
    }[dataset]
    plan_filter = "AND route_plan_type = ?" if dataset == "routes" else ""
    with connection() as conn:
        with conn.cursor() as cur:
            rows = query(
                cur,
                f"""
                SELECT DISTINCT business_date
                FROM {_t(table)}
                WHERE business_date IS NOT NULL {plan_filter}
                ORDER BY business_date
                """,
                ["OPTIMIZED"] if dataset == "routes" else None,
            )
    dates = [_date_str(row["business_date"]) for row in rows]
    return {
        "dates": dates,
        "minDate": dates[0] if dates else None,
        "maxDate": dates[-1] if dates else None,
    }
