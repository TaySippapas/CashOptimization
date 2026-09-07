# Legacy flat-table pipeline; see scripts/README.md before running.
#!/usr/bin/env python3
"""Create latest-date Unity Catalog contract views for the KTB app."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DATABRICKS_CONFIG_PROFILE", "nan-demo")

from server.sql_client import execute_many, query_dicts  # noqa: E402

VIEW_NAMES = (
    "app_settings",
    "machine_snapshot",
    "machine_daily_flow",
    "machine_denomination",
    "branch_snapshot",
    "branch_daily_flow",
    "branch_denomination_gap",
    "route_summary",
    "route_stops",
)


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def main() -> None:
    catalog = required("APP_CATALOG")
    source_schema = required("SOURCE_SCHEMA")
    target_schema = required("TARGET_SCHEMA")
    app_principal = required("APP_SERVICE_PRINCIPAL")
    if source_schema == target_schema:
        raise RuntimeError("SOURCE_SCHEMA and TARGET_SCHEMA must differ")

    source = f"`{catalog}`.`{source_schema}`"
    target = f"`{catalog}`.`{target_schema}`"
    latest_dates = (
        f"(SELECT region_code, MAX(business_date) AS business_date "
        f"FROM {source}.`app_settings` GROUP BY region_code)"
    )
    statements = [f"CREATE SCHEMA IF NOT EXISTS {target}"]
    for name in VIEW_NAMES:
        statements.append(
            f"CREATE OR REPLACE VIEW {target}.`{name}` AS "
            f"SELECT src.* FROM {source}.`{name}` src "
            f"INNER JOIN {latest_dates} latest "
            f"ON src.region_code = latest.region_code "
            f"AND src.business_date = latest.business_date"
        )
    statements.extend(
        [
            f"GRANT USE CATALOG ON CATALOG `{catalog}` TO `{app_principal}`",
            f"GRANT USE SCHEMA ON SCHEMA {target} TO `{app_principal}`",
            f"GRANT SELECT ON SCHEMA {target} TO `{app_principal}`",
        ]
    )
    execute_many(statements)

    rows = query_dicts(f"SHOW TABLES IN {target}")
    actual = {row["tableName"] for row in rows}
    missing = set(VIEW_NAMES) - actual
    if missing:
        raise RuntimeError(f"Views missing after creation: {sorted(missing)}")
    print(
        f"Ready: {catalog}.{target_schema} exposes the latest published date "
        f"from {catalog}.{source_schema}"
    )


if __name__ == "__main__":
    main()
