> ⚠️ **DEPRECATED (2026-08-26):** This runbook described the initial v2 pipeline setup (7 tables,
> entity_type pattern, fact_denomination_gap). The production schema has since evolved to 12 tables
> with separate branch/machine tables. See [`database_table_blueprint.md`](database_table_blueprint.md)
> for the current source of truth. Kept for historical reference only.

> **Status: executed 2026-08-07.** Steps 1–6 below have been run end-to-end
> against a personal/dev workspace (details omitted) — **not** the
> production workspace behind `config.yaml`'s catalog, since
> that catalog/warehouse aren't reachable from this profile. All 7 target
> tables are populated and `/api/v2/*` is live locally. Two real issues were
> hit and fixed along the way — see the callouts in Step 5.1 (broken `COPY
> INTO`) and the new note at the end of Step 1 (local SSL trust store). The
> working, re-runnable SQL lives at `scripts/sql/ktb_cash_route_setup.sql`
> (run via `scripts/run_ktb_cash_route_setup.py`); the API is
> `server/uc_repo_v2.py` + `server/router_v2.py`, mounted in `app.py`.

# Procedure: New Databricks Database + API Layer

Standalone runbook for standing up a **new, independently-structured** Unity
Catalog schema and API layer for this dashboard — separate from the existing
`config.yaml` / `server/uc_repo.py` pipeline (demo catalog
`stable_classic_nan_fe_vm_catalog.cash_optimization_app`). Same subject
matter (branches, cash machines, routes, cash flow), restructured as a
**dimension / fact model** instead of the current flat per-entity snapshot
tables, so history and denomination/flow detail don't get re-copied onto
every row.

Everything here is written for you to run with your own Databricks
workspace credentials — no code is created in the repo by this doc.

---

## 0. Design goals

| Existing pipeline (`server/uc_repo.py`) | This procedure |
|---|---|
| 9 flat tables, one row per entity per `business_date` | Dimension tables (slowly-changing attributes) + fact tables (daily measures), so you don't repeat `lat/lng/name` on every snapshot row |
| One schema, hardcoded table names | Same idea, but table names/grain documented as a contract up front (Step 3) |
| FastAPI reads raw UC rows and reshapes in Python (`server/uc_repo.py`) | Reshaping pushed into SQL views one layer down, so the API layer does thin mapping only |

Grain (one row = one …):

- `dim_branch` — one row per branch **code** (current attributes; add SCD2 later if you need history of capacity changes)
- `dim_machine` — one row per machine **id**
- `fact_cash_position` — one row per entity (branch or machine) per `business_date` (today's snapshot: opening/predicted cash, action, health)
- `fact_cash_flow_daily` — one row per entity per `series_date` per `value_type` (the 14-day trend line)
- `fact_denomination_gap` — one row per entity per denomination per `business_date`
- `dim_route` + `fact_route_stop` — one row per route per `business_date`/`plan_type`, and one row per stop

---

## 1. Prerequisites

```bash
databricks auth login --host https://<your-workspace>.cloud.databricks.com
databricks auth profiles   # confirm profile name, e.g. "my-profile"
```

You need:
- Unity Catalog enabled workspace, `CREATE CATALOG` (or an existing catalog you can `CREATE SCHEMA` in)
- A running SQL warehouse (serverless or classic) — note its **warehouse ID** (`databricks warehouses list`)
- If deploying as a Databricks App: permission to create Apps, and the App's **service principal client ID** (`databricks apps create ... ` then `databricks apps get <name>`) for grants in Step 4

**If `databricks-sql-connector` (Python) fails with
`SSLCertVerificationError: self-signed certificate in certificate chain`
while `databricks auth profiles` / the CLI itself works fine:** this isn't a
Databricks problem. The Go-based CLI and Python's `requests` (via `certifi`)
both work because they use a clean CA bundle; `databricks-sql-connector`'s
thrift backend instead builds its SSL context from your **system** trust
store. If your Mac has a locally-trusted root CA installed (check `security
find-certificate -a /Library/Keychains/System.keychain | grep labl` — look
for anything you don't recognize, e.g. a local dev-proxy root), that gets
pulled in and breaks chain validation for this one library. Workaround —
force it to use the certifi bundle instead of the system store:
```bash
export SSL_CERT_FILE=$(python3 -c "import certifi; print(certifi.where())")
```

---

## 2. Create catalog & schema

```sql
CREATE CATALOG IF NOT EXISTS ktb_cash_route;               -- or reuse an existing catalog
CREATE SCHEMA  IF NOT EXISTS ktb_cash_route.ops;
```

Run via `databricks sql` CLI, a SQL editor query, or a one-off Python script using
`databricks-sql-connector` (same pattern as `server/sql_client.py` — a
`sql.connect(server_hostname=..., http_path="/sql/1.0/warehouses/<id>", credentials_provider=...)`
context manager).

---

## 3. Table DDL (dimension / fact model)

```sql
USE CATALOG ktb_cash_route;
USE SCHEMA ops;

-- ── Dimensions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dim_branch (
  branch_code       STRING NOT NULL,
  branch_name       STRING,
  district_name     STRING,
  region_code       STRING,
  latitude          DOUBLE,
  longitude         DOUBLE,
  is_depot          BOOLEAN,
  cash_capacity_thb DECIMAL(18,2),
  min_threshold_thb DECIMAL(18,2),
  service_minutes   INT,
  window_start      STRING,   -- "HH:MM"
  window_end        STRING,
  updated_at        TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS dim_machine (
  machine_id        STRING NOT NULL,
  machine_type      STRING,
  location_name     STRING,
  district_name     STRING,
  region_code       STRING,
  latitude          DOUBLE,
  longitude         DOUBLE,
  cash_capacity_thb DECIMAL(18,2),
  updated_at        TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS dim_route (
  route_id          STRING NOT NULL,
  business_date     DATE NOT NULL,
  plan_type         STRING NOT NULL,   -- OPTIMIZED | ACTUAL
  route_label       STRING,
  truck_id          STRING,            -- vehicle_id in source
  driver_name       STRING,
  depot_code        STRING,
  route_status      STRING,            -- nullable: source has no execution status yet
  total_stops       INT,
  total_distance_km DOUBLE,
  cost_of_transport_thb    DECIMAL(18,2),
  total_cash_delivered_thb DECIMAL(18,2),
  total_cash_collected_thb DECIMAL(18,2),
  vehicle_capacity_thb DECIMAL(18,2),  -- nullable: not in source yet
  route_color_hex   STRING,            -- nullable: assign at API layer if absent
  updated_at        TIMESTAMP
) USING DELTA;

-- ── Facts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fact_cash_position (
  business_date       DATE NOT NULL,
  entity_type         STRING NOT NULL,   -- BRANCH | MACHINE
  entity_code         STRING NOT NULL,   -- branch_code or machine_id
  opening_cash_thb    DECIMAL(18,2),
  predicted_cash_thb  DECIMAL(18,2),
  predicted_inflow_thb  DECIMAL(18,2),
  predicted_outflow_thb DECIMAL(18,2),
  action_type         STRING,   -- DELIVERY | PICKUP | NO_ACTION
  health_status        STRING,   -- HEALTHY | WATCH | ACTION_NEEDED | CRITICAL
  risk_level           STRING,
  prediction_confidence DOUBLE,
  emergency_flag        BOOLEAN,
  model_id              STRING,
  model_version          STRING,
  updated_at             TIMESTAMP
) USING DELTA
PARTITIONED BY (business_date);

CREATE TABLE IF NOT EXISTS fact_cash_flow_daily (
  business_date       DATE NOT NULL,     -- the planning run this trend was computed for
  entity_type         STRING NOT NULL,
  entity_code         STRING NOT NULL,
  series_date         DATE NOT NULL,     -- the day this point represents (14-day trend)
  value_type          STRING NOT NULL,   -- ACTUAL | PREDICTED
  deposit_amount_thb    DECIMAL(18,2),
  withdrawal_amount_thb DECIMAL(18,2),
  net_amount_thb         DECIMAL(18,2),
  remaining_amount_thb   DECIMAL(18,2),  -- running balance, present in source
  updated_at              TIMESTAMP
) USING DELTA
PARTITIONED BY (business_date);

CREATE TABLE IF NOT EXISTS fact_denomination_gap (   -- was fact_denomination_mix
  business_date        DATE NOT NULL,
  entity_type           STRING NOT NULL,
  entity_code            STRING NOT NULL,
  denomination_thb        INT NOT NULL,
  predicted_note_count      INT,
  predicted_amount_thb       DECIMAL(18,2),
  predicted_mix_pct           DOUBLE,   -- feeds the Machines donut chart
  actual_note_count             INT,
  actual_mix_pct                 DOUBLE,
  gap_note_count                   INT,
  gap_amount_thb                    DECIMAL(18,2),  -- feeds denominationGap on Branches
  updated_at                        TIMESTAMP
) USING DELTA
PARTITIONED BY (business_date);

CREATE TABLE IF NOT EXISTS fact_route_stop (
  business_date   DATE NOT NULL,
  route_id        STRING NOT NULL,
  plan_type       STRING NOT NULL,
  stop_sequence   INT NOT NULL,
  stop_code       STRING,     -- branch/machine code, or "DEPOT"
  stop_name       STRING,
  stop_type       STRING,     -- START | DELIVER | PICKUP | MIXED | RETURN
  stop_status     STRING,     -- COMPLETED | IN_PROGRESS | PENDING
  eta             STRING,
  amount_thb      DECIMAL(18,2),
  latitude        DOUBLE,
  longitude       DOUBLE,
  leg_km          DOUBLE,
  cumulative_km   DOUBLE,
  updated_at      TIMESTAMP
) USING DELTA
PARTITIONED BY (business_date);
```

Notes:
- `entity_type` + `entity_code` lets `fact_cash_position` / `fact_cash_flow_daily` /
  `fact_denomination_gap` serve **both** branches and machines without duplicate
  table pairs (unlike the existing `machine_*` / `branch_*` split).
- Keep `dim_route` grain at (route_id, business_date, plan_type) since route
  labels/trucks can change daily — it's not a pure slowly-changing dimension.
- Add `ALTER TABLE ... SET TBLPROPERTIES (delta.enableChangeDataFeed = true)`
  on the fact tables if you want downstream CDC later.

---

## 4. Grants

If the consumer is a Databricks App, grant its service principal read access:

```sql
GRANT USE CATALOG ON CATALOG ktb_cash_route TO `<app-service-principal-client-id>`;
GRANT USE SCHEMA  ON SCHEMA  ktb_cash_route.ops TO `<app-service-principal-client-id>`;
GRANT SELECT ON SCHEMA ktb_cash_route.ops TO `<app-service-principal-client-id>`;
```

Get the client ID with `databricks apps get <app-name> -p <profile> --output json | jq -r .service_principal_client_id` (create the App first — see Step 8 — if it doesn't exist yet).

---

## 5. Load data

Two options depending on where your source data actually lives:

**A. One-off / mock seed** — write a Python script using
`databricks-sql-connector` (`sql.connect(...)` + multi-row `INSERT INTO`,
same pattern as `server/sql_client.bulk_insert`) that populates all 7 tables
for a given `business_date`. Good for getting the API layer working before
real data exists.

**B. Recurring load from real sources** — a Databricks Job (notebook or
`.py` task) scheduled daily that:
1. Reads ML forecast output (a model serving endpoint or a predictions
   Delta table) → upserts `fact_cash_position`, `fact_cash_flow_daily`,
   `fact_denomination_gap`.
2. Reads branch/machine master data (core banking or a maintained
   reference table) → `MERGE INTO dim_branch` / `dim_machine` on
   `branch_code` / `machine_id` (upsert, since these are dimensions).
3. Reads the OR-Tools/route-optimizer output → `dim_route` +
   `fact_route_stop`.

Use `MERGE INTO` for dimensions (upsert on natural key) and
`INSERT OVERWRITE ... PARTITION (business_date = ...)` for facts (idempotent
re-runs for a given date).

### 5.1 Concrete walkthrough: loading `mock_data/*.csv`

You have 8 files in `mock_data/` (`app_branch_snapshot.csv`,
`app_machine_snapshot.csv`, `app_branch_daily_flow.csv`,
`app_machine_daily_flow.csv`, `app_branch_denomination_gap.csv`,
`app_machine_denomination.csv`, `app_route_summary.csv`,
`app_route_stops.csv`) — no `app_settings.csv`. This is pure SQL, no Python
required: upload the CSVs to a Unity Catalog Volume, land them as staging
tables 1:1 with their headers, then transform into the Step 3 schema.

**Known gaps in this data — decide before/while loading:**

| Gap | What I did / propose |
|---|---|
| No `app_settings.csv` (region defaults: fleet size, cost/km, CO₂/km, service times, thresholds) | Hardcode the same defaults already used in `scripts/seed_uc_mock_tables.py` (`available_trucks=3`, `average_speed_kmh=62`, `cost_per_km_thb=65`, `co2_per_km_kg=0.27`, `crew_per_vehicle=2`, `city_service_minutes=25`, `district_service_minutes=35`) into a manual `INSERT` — **tell me if you have a real values source, or edit the numbers below** |
| `action_type` = `'NO GO'` (not `'NO_ACTION'`), only `NO GO`/`DELIVERY` present, no `PICKUP`/`BOTH` yet | Map `NO GO → NO_ACTION` on load; leave `PICKUP`/`BOTH` unmapped-but-passthrough so future rows with those values aren't silently dropped |
| `app_route_stops.csv` has `location_id`/`location_type` but no lat/lng/name | Backfill via `LEFT JOIN` to `dim_branch`/`dim_machine` on `location_id = branch_code`/`machine_id` at transform time |
| `app_route_summary.csv` has no `route_status`, label, depot code, color, vehicle capacity | Default `route_status = 'ON_TRACK'`, `route_label = route_id`, derive `depot_code` from the stop where `location_type='DEPOT'`, leave color/capacity `NULL` (assign in the API layer if the frontend needs a value) |

**Step A — upload to a Volume:**

```sql
CREATE VOLUME IF NOT EXISTS ktb_cash_route.ops.landing;
```

```bash
databricks fs cp mock_data/ dbfs:/Volumes/ktb_cash_route/ops/landing/ --recursive -p <profile>
```

**Step B — staging tables (schema = CSV header, verbatim) + load:**

```sql
USE CATALOG ktb_cash_route; USE SCHEMA ops;

CREATE TABLE IF NOT EXISTS stg_branch_snapshot (
  business_date DATE, region_code STRING, branch_code STRING, branch_name STRING,
  district_name STRING, latitude DOUBLE, longitude DOUBLE, is_depot BOOLEAN,
  cash_capacity_thb DECIMAL(18,2), minimum_threshold_thb DECIMAL(18,2),
  actual_cash_d_minus_1 DECIMAL(18,2), predicted_cash_d DECIMAL(18,2),
  predicted_deposit_d DECIMAL(18,2), predicted_withdrawal_d DECIMAL(18,2),
  action_type STRING, health_status STRING, emergency_flag BOOLEAN
);

CREATE TABLE IF NOT EXISTS stg_machine_snapshot (
  business_date DATE, region_code STRING, machine_id STRING, machine_type STRING,
  location_name STRING, latitude DOUBLE, longitude DOUBLE,
  cash_capacity_thb DECIMAL(18,2), minimum_threshold_thb DECIMAL(18,2),
  actual_cash_d_minus_1 DECIMAL(18,2), predicted_cash_d DECIMAL(18,2),
  deposit_amount_d DECIMAL(18,2), withdrawal_amount_d DECIMAL(18,2),
  action_type STRING, health_status STRING
);

CREATE TABLE IF NOT EXISTS stg_branch_daily_flow (
  business_date DATE, region_code STRING, branch_code STRING, series_date DATE,
  value_type STRING, deposit_amount_thb DECIMAL(18,2),
  withdrawal_amount_thb DECIMAL(18,2), net_amount_thb DECIMAL(18,2),
  remaining_amount_thb DECIMAL(18,2)
);

CREATE TABLE IF NOT EXISTS stg_machine_daily_flow (
  business_date DATE, region_code STRING, machine_id STRING, series_date DATE,
  value_type STRING, deposit_amount_thb DECIMAL(18,2),
  withdrawal_amount_thb DECIMAL(18,2), net_amount_thb DECIMAL(18,2),
  remaining_amount_thb DECIMAL(18,2)
);

CREATE TABLE IF NOT EXISTS stg_branch_denom_gap (
  business_date DATE, region_code STRING, branch_code STRING, denomination_thb INT,
  predicted_note_count INT, predicted_amount_thb DECIMAL(18,2), predicted_mix_pct DOUBLE,
  actual_note_count INT, actual_mix_pct DOUBLE, gap_note_count INT, gap_amount_thb DECIMAL(18,2)
);

CREATE TABLE IF NOT EXISTS stg_machine_denom_gap (
  business_date DATE, region_code STRING, machine_id STRING, denomination_thb INT,
  predicted_note_count INT, predicted_amount_thb DECIMAL(18,2), predicted_mix_pct DOUBLE,
  actual_note_count INT, actual_mix_pct DOUBLE, gap_note_count INT, gap_amount_thb DECIMAL(18,2)
);

CREATE TABLE IF NOT EXISTS stg_route_summary (
  business_date DATE, region_code STRING, route_id STRING, plan_version INT,
  route_plan_type STRING, vehicle_id STRING, driver_name STRING, total_stops INT,
  total_distance_km DOUBLE, cost_of_transport DECIMAL(18,2),
  total_cash_delivered DECIMAL(18,2), total_cash_collected DECIMAL(18,2),
  updated_by STRING, updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stg_route_stops (
  business_date DATE, region_code STRING, route_id STRING, plan_version INT,
  route_plan_type STRING, stop_sequence INT, location_id STRING, location_type STRING,
  action_type STRING, cash_delivered_thb DECIMAL(18,2), cash_collected_thb DECIMAL(18,2),
  eta_time TIMESTAMP, leg_km DOUBLE, cumulative_km DOUBLE
);

COPY INTO stg_branch_snapshot FROM '/Volumes/ktb_cash_route/ops/landing/app_branch_snapshot.csv'
  FILEFORMAT = CSV FORMAT_OPTIONS ('header'='true','inferSchema'='false');
COPY INTO stg_machine_snapshot FROM '/Volumes/ktb_cash_route/ops/landing/app_machine_snapshot.csv'
  FILEFORMAT = CSV FORMAT_OPTIONS ('header'='true');
COPY INTO stg_branch_daily_flow FROM '/Volumes/ktb_cash_route/ops/landing/app_branch_daily_flow.csv'
  FILEFORMAT = CSV FORMAT_OPTIONS ('header'='true');
COPY INTO stg_machine_daily_flow FROM '/Volumes/ktb_cash_route/ops/landing/app_machine_daily_flow.csv'
  FILEFORMAT = CSV FORMAT_OPTIONS ('header'='true');
COPY INTO stg_branch_denom_gap FROM '/Volumes/ktb_cash_route/ops/landing/app_branch_denomination_gap.csv'
  FILEFORMAT = CSV FORMAT_OPTIONS ('header'='true');
COPY INTO stg_machine_denom_gap FROM '/Volumes/ktb_cash_route/ops/landing/app_machine_denomination.csv'
  FILEFORMAT = CSV FORMAT_OPTIONS ('header'='true');
COPY INTO stg_route_summary FROM '/Volumes/ktb_cash_route/ops/landing/app_route_summary.csv'
  FILEFORMAT = CSV FORMAT_OPTIONS ('header'='true');
COPY INTO stg_route_stops FROM '/Volumes/ktb_cash_route/ops/landing/app_route_stops.csv'
  FILEFORMAT = CSV FORMAT_OPTIONS ('header'='true');
```

**⚠️ This `COPY INTO` block doesn't actually work as written.** Every
statement fails with `[DELTA_FAILED_TO_MERGE_FIELDS] Failed to merge fields
'business_date' and 'business_date'` — `COPY INTO` against an already-typed
Delta table tries to reconcile the CSV's inferred schema against the target
schema via a merge step, and that merge chokes even on plain scalar columns
here. Use `read_files()` (the modern table-valued function) + a normal
`INSERT INTO ... SELECT` instead — it infers real types (`DATE`, `DOUBLE`,
`BOOLEAN`, …) directly from the CSV, so the `INSERT` is just an ordinary
positional cast, no schema merge involved:

```sql
TRUNCATE TABLE stg_branch_snapshot;
INSERT INTO stg_branch_snapshot
SELECT business_date, region_code, branch_code, branch_name, district_name,
       latitude, longitude, is_depot, cash_capacity_thb, minimum_threshold_thb,
       actual_cash_d_minus_1, predicted_cash_d, predicted_deposit_d, predicted_withdrawal_d,
       action_type, health_status, emergency_flag
FROM read_files('/Volumes/ktb_cash_route/ops/landing/app_branch_snapshot.csv', format => 'csv', header => true);
-- ...same pattern (TRUNCATE + INSERT ... SELECT ... FROM read_files(...)) for
-- the other 7 staging tables. Full working version: scripts/sql/ktb_cash_route_setup.sql
```

**Step C — transform staging → target schema:**

```sql
-- app_settings: no source file, hand-entered defaults (edit as needed)
INSERT INTO app_settings VALUES (
  DATE'2026-08-07', 'KK', 'Khon Kaen', 'MUEANG',
  3, 25000000, 62.0, 65.0, 0.27, 2, 60.0, 80.0, 50.0, 25, 35, 10.0, current_timestamp()
);  -- only needed if you kept app_settings from the original 9-table contract;
    -- with the dim/fact model these become defaults baked into the API layer instead.

-- dim_branch
INSERT INTO dim_branch
SELECT branch_code, branch_name, district_name, region_code, latitude, longitude,
       is_depot, cash_capacity_thb, minimum_threshold_thb,
       NULL, NULL, NULL,               -- service_minutes, window_start, window_end (not in source)
       current_timestamp()
FROM stg_branch_snapshot;

-- dim_machine
INSERT INTO dim_machine
SELECT machine_id, machine_type, location_name, NULL, region_code, latitude, longitude,
       cash_capacity_thb, current_timestamp()
FROM stg_machine_snapshot;

-- fact_cash_position (branches + machines unioned via entity_type)
INSERT INTO fact_cash_position
SELECT business_date, 'BRANCH', branch_code, actual_cash_d_minus_1, predicted_cash_d,
       predicted_deposit_d, predicted_withdrawal_d,
       CASE action_type WHEN 'NO GO' THEN 'NO_ACTION' ELSE action_type END,
       health_status, NULL, NULL, emergency_flag, NULL, NULL, current_timestamp()
FROM stg_branch_snapshot
UNION ALL
SELECT business_date, 'MACHINE', machine_id, actual_cash_d_minus_1, predicted_cash_d,
       NULL, NULL,   -- machine snapshot has deposit_amount_d/withdrawal_amount_d, not "predicted" inflow/outflow — see note below
       CASE action_type WHEN 'NO GO' THEN 'NO_ACTION' ELSE action_type END,
       health_status, NULL, NULL, FALSE, NULL, NULL, current_timestamp()
FROM stg_machine_snapshot;

-- fact_cash_flow_daily
INSERT INTO fact_cash_flow_daily
SELECT business_date, 'BRANCH', branch_code, series_date, value_type,
       deposit_amount_thb, withdrawal_amount_thb, net_amount_thb, remaining_amount_thb,
       current_timestamp()
FROM stg_branch_daily_flow
UNION ALL
SELECT business_date, 'MACHINE', machine_id, series_date, value_type,
       deposit_amount_thb, withdrawal_amount_thb, net_amount_thb, remaining_amount_thb,
       current_timestamp()
FROM stg_machine_daily_flow;

-- fact_denomination_gap
INSERT INTO fact_denomination_gap
SELECT business_date, 'BRANCH', branch_code, denomination_thb, predicted_note_count,
       predicted_amount_thb, predicted_mix_pct, actual_note_count, actual_mix_pct,
       gap_note_count, gap_amount_thb, current_timestamp()
FROM stg_branch_denom_gap
UNION ALL
SELECT business_date, 'MACHINE', machine_id, denomination_thb, predicted_note_count,
       predicted_amount_thb, predicted_mix_pct, actual_note_count, actual_mix_pct,
       gap_note_count, gap_amount_thb, current_timestamp()
FROM stg_machine_denom_gap;

-- dim_route
INSERT INTO dim_route
SELECT s.route_id, s.business_date, s.route_plan_type, s.route_id AS route_label,
       s.vehicle_id, s.driver_name,
       (SELECT rs.location_id FROM stg_route_stops rs
        WHERE rs.route_id = s.route_id AND rs.location_type = 'DEPOT' LIMIT 1) AS depot_code,
       'ON_TRACK', s.total_stops, s.total_distance_km, s.cost_of_transport,
       s.total_cash_delivered, s.total_cash_collected,
       NULL, NULL, current_timestamp()
FROM stg_route_summary s;

-- fact_route_stop (backfill lat/lng/name via join to dims)
INSERT INTO fact_route_stop
SELECT rs.business_date, rs.route_id, rs.route_plan_type, rs.stop_sequence, rs.location_id,
       COALESCE(b.branch_name, m.location_name, 'Depot') AS stop_name,
       CASE WHEN rs.location_type = 'DEPOT' THEN 'START'
            WHEN rs.action_type = 'DELIVERY' THEN 'DELIVER'
            WHEN rs.action_type = 'NO GO' THEN 'MIXED'
            ELSE rs.action_type END,
       NULL,  -- stop_status: no execution progress in source yet
       date_format(rs.eta_time, 'HH:mm'),
       rs.cash_delivered_thb - rs.cash_collected_thb,   -- signed: +deliver, -pickup
       COALESCE(b.latitude, m.latitude) AS latitude,
       COALESCE(b.longitude, m.longitude) AS longitude,
       rs.leg_km, rs.cumulative_km, current_timestamp()
FROM stg_route_stops rs
LEFT JOIN dim_branch  b ON rs.location_id = b.branch_code
LEFT JOIN dim_machine m ON rs.location_id = m.machine_id;
```

Note on `fact_cash_position` for machines: `app_machine_snapshot.csv` gives
`deposit_amount_d`/`withdrawal_amount_d` (today's actual flow), not a
forward-looking `predicted_inflow`/`predicted_outflow` like branches have —
decide whether machines should populate `predicted_inflow_thb`/`predicted_outflow_thb`
from those same columns (treating "today" as the forecast) or leave them
`NULL` until a machine-level forecast field exists. **Decision taken:**
populated from `deposit_amount_d`/`withdrawal_amount_d` (treat today as the
forecast) — see `scripts/sql/ktb_cash_route_setup.sql`.

---

## 6. API layer

Keep this as a **new, separate FastAPI router** (don't touch `app.py` /
`server/uc_repo.py`) so the two pipelines don't collide — e.g. mount it at a
different prefix such as `/api/v2`.

**Implemented as:** `server/uc_repo_v2.py` (own connection helper — own
catalog/schema/warehouse via `V2_CATALOG`/`V2_SCHEMA`/`V2_WAREHOUSE_ID` env
vars, doesn't touch `server/settings.py`) + `server/router_v2.py` (Pydantic
models, per-endpoint try/except → `HTTPException`) + two lines in `app.py`
(`from server.router_v2 import router as router_v2` /
`app.include_router(router_v2)`) to mount it. Verified live against real
data — see endpoints below (all take `?date=` and default to the latest
`business_date` in `fact_cash_position` when omitted).

| Endpoint | Backing query | Returns |
|---|---|---|
| `GET /api/v2/health` | `SELECT 1` against the warehouse | `{status, catalog, schema, warehouseId}` |
| `GET /api/v2/branches?date=` | `dim_branch` JOIN `fact_cash_position` WHERE `entity_type='BRANCH'` | `Branch[]` |
| `GET /api/v2/machines?date=` | same JOIN, `entity_type='MACHINE'` | `Machine[]` |
| `GET /api/v2/branches/{code}/cash-flow?date=` | `fact_cash_flow_daily` for that entity | `CashFlowPoint[]` (14-day trend) |
| `GET /api/v2/machines/{id}/cash-flow?date=` | same, machine | `CashFlowPoint[]` |
| `GET /api/v2/branches/{code}/denomination-gap?date=` | `fact_denomination_gap` for that entity | `DenominationGap[]` |
| `GET /api/v2/machines/{id}/denomination-gap?date=` | same, machine | `DenominationGap[]` |
| `GET /api/v2/routes?date=&plan_type=` | `dim_route` JOIN `fact_route_stop`, stops nested per route | `Route[]` |

Not implemented: a composed `GET /api/v2/plan` bundle endpoint, and
frontend-shape-matching (`CashStatus`, `netFlow`/`projectedClosingCash`
derived fields, etc. from `frontend/src/types/plan.ts`) — this pass is a
plain query API over the dim/fact schema, not a drop-in replacement for the
existing `/api/plan` response. Add those on top if/when you do Step 7.
| `GET /api/v2/health` | `SELECT 1` against the warehouse | `{status, catalog, schema, warehouseId}` |

Implementation checklist:
1. `sql_client.py`-style connection helper (`databricks-sql-connector`,
   `Config().authenticate` for auth — works both locally via CLI profile and
   inside a Databricks App via the attached warehouse resource).
2. One query function per fact-join above, returning `list[dict]`.
3. A thin mapper (`_map_action`, `_map_health`, etc. — reuse the same
   UPPER_SNAKE → Title Case lookup tables already in `server/uc_repo.py` if
   you want the enums to match the frontend's `CashStatus` / `RouteStatus`
   string unions exactly).
4. Pydantic response models matching `frontend/src/types/*.ts` field-for-field
   (catches shape drift at the API layer instead of silently breaking the UI).
5. Parameterize `business_date` / `region_code` from server-side config or
   validated query params only — never interpolate raw request strings into
   SQL (see the `_filter_params` pattern in `uc_repo.py`).
6. Wrap each endpoint in try/except → fall back to `{"source": "error", ...}`
   with an empty payload, so one bad query doesn't 500 the whole dashboard
   (same defensive pattern `app.py` already uses).

---

## 7. Wire the frontend

> **Status: done, verified in-browser 2026-08-11/12.** `frontend/src/api/backend.ts`
> now points at `/api/v2/branch-tracks`, `/api/v2/machine-tracks`,
> `/api/v2/branch-inputs`, `/api/v2/route-executions`, `/api/v2/health`
> (only the URLs changed — `App.tsx`/`useAppData.ts` needed no edits, since
> the new endpoints return the exact same envelope/dict shapes as the old
> `/api/*` ones). No env-flag toggle was added — the old pipeline's
> warehouse/catalog aren't reachable from this workspace anyway, so there
> was nothing to toggle between. Confirmed via a headless-browser pass
> (Playwright): Overview, Machines, and Route Tracking all render real data,
> nav pill reads `UC · ktb_cash_route.ops`, zero console errors.

Original plan (superseded by the above, kept for reference):
1. Add a base URL constant (e.g. `VITE_API_V2_BASE`, default `/api/v2`) in
   `frontend/src/api/` (check what's already there — likely where the
   existing fetch calls live).
2. Add fetch functions returning the same TS types (`Branch`, `Machine`,
   `RouteExecution`, `PlanBundle` from `frontend/src/types`) — if the API
   response shapes match Step 6.4, no type changes needed.
3. Feed them into `useAppData()` (`frontend/src/hooks/useAppData.ts`) via
   whatever loads `AppData` today in `frontend/src/app/App.tsx` — swap the
   data source there, gated by an env flag so you can toggle old vs new
   pipeline during rollout.
4. `dataLoading` / `dataSourceLabel` fields already exist on `AppData` —
   use them to show a loading state and label the data source in the UI
   while you validate.

### 7.1 Three real bugs found + fixed while wiring this up

These aren't hypothetical — each one visibly broke the running app until fixed:

1. **Response shape mismatch.** The raw `/api/v2/branches`, `/machines`,
   `/routes` built in Step 6 return DB-column-shaped JSON, not what the
   frontend's `BranchTrack`/`Machine`/`RouteExecution` TS types expect
   (derived `health`/`action` enums, collapsed `trend`/`denomination`
   objects, etc. — `server/uc_repo.py`'s `fetch_branches` et al. already do
   this mapping for the old pipeline). Added `fetch_branch_tracks`,
   `fetch_machine_tracks`, `fetch_branch_inputs`, `fetch_route_executions`
   to `server/uc_repo_v2.py`, mirroring `uc_repo.py`'s output dict shapes
   exactly, plus 4 new endpoints in `router_v2.py`. `RouteExecution` needs
   live-tracking fields (`completed`, `cashOnBoard`, `etaReturn`, `slaPct`)
   that don't exist in the planning-only mock data — those are static
   placeholders (`completed=0`, `status="On Track"`, etc.), clearly
   commented in the code.
2. **~58s response times.** Every `fetch_*` function opened a **new**
   Databricks SQL connection per query (`fetch_machine_tracks` alone made
   4). Connection open cost ~5s (auth handshake) vs <1s per query once
   connected — measured 58s for one endpoint. Fixed by having each public
   `fetch_*` function open **one** connection and share its cursor across
   all queries it needs (~7-8s now, dominated by the one handshake).
3. **Concurrent 503s.** Each connection also built a fresh `Config()`,
   which shells out to `databricks auth token --force-refresh` on
   construction. With 5 endpoints firing in parallel (doubled by React
   StrictMode in dev), concurrent CLI subprocesses raced on the local token
   cache file and some lost (`exit status 45`). Fixed by caching `Config()`
   once per process (`@lru_cache` in `uc_repo_v2.py`) instead of rebuilding
   it per connection.
4. **`Vehicle Utilization: NaN%`** on the Overview page — computed
   frontend-side as `cashOnBoard / vehicleCapacity` averaged across routes;
   `dim_route.vehicle_capacity_thb` is `NULL` (documented gap in Step 5.1),
   and `0/0` poisons the whole average with `NaN`. Fixed properly rather
   than just null-guarding it: `fetch_route_executions` now `LEFT JOIN`s
   `dim_truck` on `truck_id` and uses the truck's real
   `cash_capacity_thb` as `vehicleCapacity` when the route-level override is
   absent — using data that was already sitting in the catalog.

---

## 8. Deploy

Same mechanics as [`DEPLOY.md`](DEPLOY.md):

```bash
databricks apps create ktb-cash-route-v2 -p <profile>
databricks sync . /Workspace/Users/<you>/ktb-cash-route-v2 -p <profile> \
  --exclude .git --exclude node_modules --exclude .venv
databricks apps deploy ktb-cash-route-v2 \
  --source-code-path /Workspace/Users/<you>/ktb-cash-route-v2 -p <profile>
databricks apps update ktb-cash-route-v2 -p <profile> --json '{
  "resources": [{"name": "sql-warehouse", "sql_warehouse": {"id": "<warehouse-id>", "permission": "CAN_USE"}}]
}'
```

---

## 9. Validation checklist

- [ ] `SELECT COUNT(*) FROM ktb_cash_route.ops.<table>` non-zero for every table, for today's `business_date`
- [ ] `GET /api/v2/health` returns `status: ok`
- [ ] `GET /api/v2/branches` row count matches `dim_branch` row count for the resolved date
- [ ] Frontend renders Overview/Machines/Branches/Route Tracking pages with the new source and no console errors
- [ ] Spot-check one branch's `predictedCash` / `action` against the raw fact row — confirm mapper enums (`_map_action` etc.) produce the exact strings the frontend's `CashStatus` / `RouteStatus` unions expect
- [ ] Re-run the Step 5 load for a second `business_date` and confirm old dates aren't overwritten (partition isolation)
