"""Databricks SQL warehouse client for Unity Catalog reads/writes."""
from __future__ import annotations

import logging
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterator, Sequence

from urllib.parse import urlparse

from databricks import sql
from databricks.sdk.core import Config

from server.settings import AppSettings, get_settings

log = logging.getLogger(__name__)


def bare_hostname(raw: str) -> str:
    """Strip scheme and path from a workspace URL.

    sql.connect wants a bare host, but Config().host carries whatever was
    passed to `databricks auth login` — often pasted from the browser with a
    path still attached (e.g. ".../browse"), which turns every request into a
    404 with an empty error message.
    """
    parsed = urlparse(raw if "//" in raw else f"https://{raw}")
    return parsed.netloc or parsed.path.split("/", 1)[0]


@contextmanager
def sql_connection(settings: AppSettings | None = None) -> Iterator[Any]:
    settings = settings or get_settings()
    if not settings.warehouse_id:
        raise RuntimeError("DATABRICKS_WAREHOUSE_ID / warehouse_id is not configured")

    cfg = Config()
    conn = sql.connect(
        server_hostname=bare_hostname(cfg.host),
        http_path=f"/sql/1.0/warehouses/{settings.warehouse_id}",
        credentials_provider=lambda: cfg.authenticate,
    )
    try:
        yield conn
    finally:
        conn.close()


def query_dicts(statement: str, params: Sequence[Any] | None = None) -> list[dict[str, Any]]:
    with sql_connection() as conn:
        with conn.cursor() as cur:
            if params:
                cur.execute(statement, tuple(params))
            else:
                cur.execute(statement)
            cols = [d[0] for d in (cur.description or [])]
            rows = cur.fetchall() or []
            return [dict(zip(cols, row)) for row in rows]


def execute_many(statements: list[str]) -> None:
    with sql_connection() as conn:
        with conn.cursor() as cur:
            for statement in statements:
                cur.execute(statement)


def _sql_literal(v: Any) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float, Decimal)) and not isinstance(v, bool):
        return str(v)
    if isinstance(v, datetime):
        return f"TIMESTAMP '{v.strftime('%Y-%m-%d %H:%M:%S')}'"
    if isinstance(v, date):
        return f"DATE '{v.isoformat()}'"
    s = str(v).replace("'", "''")
    return f"'{s}'"


def bulk_insert(table: str, rows: list[tuple], chunk_size: int = 80) -> None:
    """Insert rows with multi-value INSERT statements (fast over SQL warehouse)."""
    if not rows:
        return
    with sql_connection() as conn:
        with conn.cursor() as cur:
            for i in range(0, len(rows), chunk_size):
                chunk = rows[i : i + chunk_size]
                values = ",\n".join(
                    "(" + ", ".join(_sql_literal(v) for v in row) + ")" for row in chunk
                )
                cur.execute(f"INSERT INTO {table} VALUES {values}")
                log.info("Inserted %s rows into %s (%s-%s)", len(chunk), table, i, i + len(chunk))
