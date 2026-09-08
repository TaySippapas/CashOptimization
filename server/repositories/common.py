"""Shared table qualification and business-date resolution."""
from __future__ import annotations

import logging
import os
import threading
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
_max_date_lock = threading.Lock()


def _max_business_date(cur: Any, table: str, plan_type: str | None = None) -> str | None:
    now = time.monotonic()
    key = f"{table}:{plan_type}" if plan_type is not None else table
    with _max_date_lock:
        hit = _max_date_cache.get(key)
        if hit and now - hit[0] < _MAX_DATE_TTL_S:
            return hit[1]

    # Queried outside the lock on purpose: query_many resolves dates from
    # several worker threads at once, and holding a lock across a warehouse
    # round trip would serialise the fan-out this pool exists to parallelise.
    # Two threads racing the same miss both query and write the same answer —
    # a wasted round trip, never a wrong one.
    plan_filter = " WHERE route_plan_type = ?" if plan_type is not None else ""
    rows = query(cur, f"SELECT MAX(business_date) AS d FROM {_t(table)}{plan_filter}",
                 [plan_type] if plan_type is not None else None)
    d = rows[0]["d"] if rows else None
    value = d.isoformat() if hasattr(d, "isoformat") else (str(d) if d else None)

    with _max_date_lock:
        _max_date_cache[key] = (now, value)
    return value


def clear_date_cache() -> None:
    """Forget resolved latest-dates (call after loading new data)."""
    with _max_date_lock:
        _max_date_cache.clear()


def latest_business_date(cur: Any = None) -> str | None:
    if cur is not None:
        return _max_business_date(cur, "fact_cash_position")
    with connection() as conn:
        with conn.cursor() as c:
            return _max_business_date(c, "fact_cash_position")


def _resolve_date(cur: Any, business_date: str | None) -> str:
    return business_date or latest_business_date(cur)


def _latest_route_date(cur: Any, plan_type: str | None = None) -> str | None:
    """Get the most recent business_date available in fact_route_summary."""
    return _max_business_date(cur, "fact_route_summary", plan_type)


def _resolve_route_date(cur: Any, business_date: str | None, plan_type: str | None = None) -> str:
    """Route data lives on a different date than branch/machine. Resolve accordingly."""
    return business_date or _latest_route_date(cur, plan_type) or ""


def _latest_machine_date(cur: Any) -> str | None:
    """Latest business_date in fact_machine_position (may differ from branch date)."""
    return _max_business_date(cur, "fact_machine_position")
