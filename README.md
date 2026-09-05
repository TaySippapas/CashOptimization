# KTB Cash Delivery Route Optimization — Khon Kaen

Executive monitoring dashboard for **cash-in-transit route optimization** across
Krungthai Bank (KTB) branches in **Khon Kaen province**. Visualizes an
optimized dispatch plan against the current manual route, driven by ML cash
inflow/outflow forecast per branch.

Built as a **Databricks App** (React frontend + FastAPI backend) reading
**real production data** from Unity Catalog via SQL warehouse.

## Data schema

**Source of truth:** [`database_table_blueprint.md`](database_table_blueprint.md) — 12 tables
(dim/fact model, branch + machine + route domains).

### Unity Catalog

Workspace settings live in `config.yaml`, which is **gitignored** so warehouse
and catalog identifiers stay out of version control. Set it up once:

```bash
cp config.example.yaml config.yaml   # then fill in your own values
```

| Setting | Where it comes from |
|---------|---------------------|
| Catalog / Schema | `config.yaml`, or `V2_CATALOG` / `V2_SCHEMA` |
| Warehouse | `config.yaml`, or `V2_WAREHOUSE_ID` / `DATABRICKS_WAREHOUSE_ID` |
| Center | `config.yaml` |
| Business date | `auto` (latest in `fact_cash_position`) |

Auth is never stored in the repo — `databricks auth login` writes an OAuth
profile to `~/.databrickscfg`, which the SDK picks up at runtime.

### Tables (12)

| Domain | Tables | Data source |
|--------|--------|-------------|
| Branch | `dim_branch`, `fact_cash_position`, `fact_cash_flow_daily`, `fact_branch_denomination` | Real ✔ |
| Machine | `dim_machine`, `fact_machine_position`, `fact_machine_denomination`, `fact_machine_flow_daily` | Pending |
| Route | `dim_truck`, `fact_route_summary`, `fact_route_stop`, `fact_route_stop_denomination` | Pending |

## Architecture

```
Real source tables (br_master_channel, stockh, br_forecast_opth_rev, br_denom_plan_opth, ...)
        │
        ▼
Saved SQL queries (CREATE OR REPLACE TABLE) → 12 fact/dim tables
        │
        ▼
SQL Warehouse → FastAPI (server/uc_repo_v2.py + server/router_v2.py)
        │
        ▼
React UI (frontend/dist/)
```

## Key files

| Path | Purpose |
|------|---------|
| `database_table_blueprint.md` | 📖 Data schema source of truth (12 tables) |
| `config.yaml` | Warehouse, catalog, schema, center config |
| `app.yaml` | Databricks App entry + env vars |
| `server/uc_repo_v2.py` | Backend: UC queries + response mapping |
| `server/router_v2.py` | FastAPI route handlers (`/api/v2/*`) |
| `frontend/dist/` | Pre-built React bundle |
| `CONVENTIONS.md` | Frontend code structure |

## Deploy

```bash
# Backend-only change (Python):
databricks apps deploy ktb-cash-optimization-v2 \
  --source-code-path /Workspace/Users/thanapat.sinsrangboon@krungthai.com/cash-and-route-optimization

# Frontend change (.tsx):
# 1. Build: nodeenv + npm install + npm run build
# 2. Remove node_modules
# 3. Deploy (same command above)
```

App URL: https://ktb-cash-optimization-v2-3964872289883595.aws.databricksapps.com

## What it shows

- **Exec KPIs**: man-hours saved, idle-cash reduction (THB), distance reduced,
  transport cost saved, fleet utilization, on-time SLA, CO₂ avoided.
- **Route map** (Leaflet): each branch is a node colored by required action —
  🟠 **replenish** (running low), 🔵 **pickup** (excess cash), ⚫ **skipped**
  (no action). Optimized routes (solid, per-van color) vs current manual route
  (dashed red). Not every branch is visited each cycle.
- **Optimized vs current comparison**: distance, crew man-hours, on-road time,
  vehicles deployed.
- **Branch cash forecast table**: ML predicted inflow/outflow, projected closing
  balance, status, and action amount.
- **Dispatch panel**: per-van ordered stop list with ETA, cumulative km, and
  cash delivered/picked-up.

## Pages

- **Dashboard** — exec monitoring view (KPIs, map, comparison, dispatch).
- **Configure Inputs** — define all inputs dynamically:
  - **Optimizer & cost parameters**: number of vans, avg speed, road factor,
    cost/km, CO₂/km, crew size, service times, and the cash-policy thresholds
    (replenish target, excess trigger, keep-after-pickup, idle-cash residual).
  - **Branch & ML forecast table**: fully editable rows (add/remove branches),
    each with location, vault capacity, thresholds, opening cash, and the ML
    predicted inflow/outflow. Status (replenish/pickup/OK) is derived live.
  - **Import / export**: JSON (full config) and CSV (branches). Config is
    auto-saved to the browser (localStorage).

Everything downstream — statuses, demands, routes, and all KPIs — is recomputed
from these inputs, so changing any value and clicking **Generate plan** updates
the whole dashboard (e.g. changing van count re-clusters the routes).

### Input formats

**Branch CSV** — header row must be exactly:

```
code,name,district,lat,lng,isDepot,cashCapacity,minThreshold,openingCash,predictedInflow,predictedOutflow
```

| Field | Meaning |
|-------|---------|
| `code` | Unique branch code |
| `name` | Display name |
| `district` | `Mueang Khon Kaen` = city (shorter dwell time) |
| `lat`, `lng` | WGS84 decimal degrees |
| `isDepot` | `true` for the cash center (exactly one row) |
| `cashCapacity` | Vault capacity (THB) |
| `minThreshold` | Minimum operating cash (THB) |
| `openingCash` | Start-of-day balance (THB) |
| `predictedInflow` / `predictedOutflow` | ML model outputs (THB) |

**Status rule:** `closing = openingCash + inflow − outflow`; `REPLENISH` if
`closing < minThreshold`, `PICKUP` if `closing > capacity × excessTrigger`,
else `OK` (not visited).

**Full JSON config** = `{ "params": {…}, "branches": [{…}] }` — exported files
re-import losslessly.

## Data model (mock)

- `frontend/src/data/branches.ts` — real KTB Khon Kaen branch locations.
- `frontend/src/data/mockData.ts` — ML forecast mimic + CVRP-TW route builder
  (nearest-neighbor + 2-opt, 2 vans clustered by geography). Fully client-side.
- `server/mock.py` — Python port of the same logic, exposed at `GET /api/plan`
  for the deployed app. Swap these two for the real ML model + OR-Tools solve.

## Run locally

### Frontend (primary review path — pure mock data, no backend needed)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

### Full app (FastAPI serving built frontend, mirrors Databricks runtime)

```bash
cd frontend && npm run build && cd ..
pip install -r requirements.txt
uvicorn app:app --reload --port 8000   # http://localhost:8000
```

## Deploy to Databricks Apps

```bash
cd frontend && npm run build && cd ..

databricks apps create ktb-cash-route -p nan-demo

databricks sync . /Users/<you>@databricks.com/ktb-cash-route \
  --exclude node_modules --exclude .venv --exclude __pycache__ \
  --exclude .git --exclude "frontend/src" --exclude "frontend/node_modules" \
  -p nan-demo

databricks apps deploy ktb-cash-route \
  --source-code-path /Workspace/Users/<you>@databricks.com/ktb-cash-route \
  -p nan-demo
```

## Wiring to real systems (next phase)

1. **ML forecast** — replace `build_branches()` in `server/mock.py` with a query
   against the inflow/outflow model's predictions table / serving endpoint.
2. **Route optimizer** — replace `_order_route()` / clustering with a real
   OR-Tools CVRP-TW solve (vehicle capacity = van cash limit, time windows =
   branch service hours, demand = signed replenish/pickup amount).
3. Point the frontend at `GET /api/plan` instead of the client-side generator.
