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


def fetch_date_range() -> dict[str, Any]:
    """Earliest and latest business_date available, for bounding the date picker."""
    with connection() as conn:
        with conn.cursor() as cur:
            rows = query(
                cur,
                f"""
                SELECT MIN(business_date) AS min_d, MAX(business_date) AS max_d
                FROM {_t('fact_cash_position')}
                """,
            )
    r = rows[0] if rows else {}
    return {
        "minDate": _date_str(r.get("min_d")) or None,
        "maxDate": _date_str(r.get("max_d")) or None,
    }
