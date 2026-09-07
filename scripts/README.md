# Database tooling

Run commands from the repository root. SQL files contain explicit catalog and
schema names: inspect and edit them for your target before execution. The
runner uses the V2 app's warehouse settings, but `USE CATALOG` / `USE SCHEMA`
inside the SQL file determine where statements execute.

| Location | Purpose |
| --- | --- |
| `sql/schema/v2_schema_setup.sql` | Baseline schema for the current V2 backend |
| `sql/migrations/v2_add_cost_of_fund.sql` | Add/backfill cost-of-fund fields missing from the baseline |
| `sql/seeds/v2_seed_mock_data.sql` | Deterministic demo data; truncates target tables |
| `legacy/` | Older flat-table, view, notebook, and seven-table pipelines |

## Current setup

Review SQL without opening a warehouse connection:

```sh
python scripts/run_ktb_cash_route_setup.py --dry-run
python scripts/run_ktb_cash_route_setup.py scripts/sql/migrations/v2_add_cost_of_fund.sql --dry-run
```

For a new empty schema, run the baseline followed by the cost-of-fund migration:

```sh
python scripts/run_ktb_cash_route_setup.py
python scripts/run_ktb_cash_route_setup.py scripts/sql/migrations/v2_add_cost_of_fund.sql
```

The baseline's `CREATE TABLE IF NOT EXISTS` does not upgrade existing tables.
The migration uses `ADD COLUMNS` and is applied once to databases without those
columns. Inspect existing columns before applying it.

For a **new disposable demo database**, run this order so the migration backfills
seeded balances:

```sh
python scripts/run_ktb_cash_route_setup.py
python scripts/run_ktb_cash_route_setup.py scripts/sql/seeds/v2_seed_mock_data.sql
python scripts/run_ktb_cash_route_setup.py scripts/sql/migrations/v2_add_cost_of_fund.sql
```

The seed uses positional inserts for the baseline schema. It is not an upgrade
or reseed procedure for an already migrated database. Operational ETL must
populate daily `cost_of_fund_thb`; the migration is not a scheduled computation.
See the [runtime contract](../docs/data/runtime-schema.md).

The runner supports the repository's semicolon-delimited SQL files, not SQL
procedures or semicolons embedded in string literals.

## Legacy tooling

Preserved for manual workflows and external jobs, not current V2 setup:

- `legacy/create_uc_app_views.py`: latest-date views for the old flat-table API.
- `legacy/seed_uc_mock_tables.py`: mock rows for that same API.
- `legacy/refresh_uc_daily.py`: Databricks notebook requiring `spark` and
  `dbutils`; not a standalone local CLI.
- `legacy/sql/ktb_cash_route_setup.sql`: older staging/seven-table design.
- `legacy/sql/dim_truck.sql`: earlier truck master with a different column set.

The first two scripts resolve imports relative to the repository root after
their move. Update external job paths to `scripts/legacy/` before running them
again. Historical reports live in [docs/archive](../docs/archive/README.md).
