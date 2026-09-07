"""Shared table qualification and business-date resolution."""
from __future__ import annotations

import logging
import os
import time
from typing import Any

from server.settings import get_settings
from server.warehouse import connection, query


log = logging.getLogger(__name__)

# V2 overrides win; otherwise use shared config.yaml / APP_* settings.
_settings = get_settings()
CATALOG = os.getenv("V2_CATALOG") or _settings.catalog
SCHEMA = os.getenv("V2_SCHEMA") or _settings.schema


def _t(name: str) -> str:
    return f"{CATALOG}.{SCHEMA}.{name}"


# Avoid resolving the same latest business date on every request.
_MAX_DATE_TTL_S = 60
_max_date_cache: dict[str, tuple[float, str | None]] = {}


def _max_business_date(cur: Any, table: str) -> str | None:
    hit = _max_date_cache.get(table)
    now = time.monotonic()
    if hit and now - hit[0] < _MAX_DATE_TTL_S:
        return hit[1]
    rows = query(cur, f"SELECT MAX(business_date) AS d FROM {_t(table)}")
    d = rows[0]["d"] if rows else None
    value = d.isoformat() if hasattr(d, "isoformat") else (str(d) if d else None)
    _max_date_cache[table] = (now, value)
    return value


def clear_date_cache() -> None:
    """Forget resolved latest-dates (call after loading new data)."""
    _max_date_cache.clear()


def latest_business_date(cur: Any = None) -> str | None:
    if cur is not None:
        return _max_business_date(cur, "fact_cash_position")
    with connection() as conn:
        with conn.cursor() as c:
            return _max_business_date(c, "fact_cash_position")


def _resolve_date(cur: Any, business_date: str | None) -> str:
    return business_date or latest_business_date(cur)


def _latest_route_date(cur: Any) -> str | None:
    """Get the most recent business_date available in fact_route_summary."""
    return _max_business_date(cur, "fact_route_summary")


def _resolve_route_date(cur: Any, business_date: str | None) -> str:
    """Route data lives on a different date than branch/machine. Resolve accordingly."""
    return business_date or _latest_route_date(cur) or _resolve_date(cur, business_date)


def _latest_machine_date(cur: Any) -> str | None:
    """Latest business_date in fact_machine_position (may differ from branch date)."""
    return _max_business_date(cur, "fact_machine_position")
