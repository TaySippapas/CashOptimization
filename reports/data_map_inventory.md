# KTB Cash App — Data Inventory Map

| | |
|---|---|
| Live app | see `databricks apps get <app-name>` |
| App-facing schema | `<catalog>.cash_optimization_views` |
| Source schema | `<catalog>.cash_optimization_mock` |
| View filter | latest `business_date` per `region_code` from `app_settings` |
| Active business date | `2026-07-30` · region `KK` |
| Warehouse | see `config.yaml` |
| Updated | 2026-07-30 |

```text
cash_optimization_mock.*   (Delta tables)
        │
        ▼  views filter MAX(business_date) per region
cash_optimization_views.*  (contract views)
        │
        ▼  SQL warehouse
FastAPI /api/*
        │
        ▼
React UI pages
```

---

## Summary: UI ← UC mapping

| UI page | Status | UC views used | API |
|---|---|---|---|
| **Machines** | **UC** | `machine_snapshot`, `machine_daily_flow`, `machine_denomination` | `GET /api/machines` |
| **Branches** | **UC** | `branch_snapshot`, `branch_daily_flow`, `branch_denomination_gap` | `GET /api/branches` |
| **Route Tracking** | **UC** | `route_summary`, `route_stops` | `GET /api/routes` |
| **Truck Detail** | **UC** | same as routes | `GET /api/routes` |
| **Overview** | **UC (partial)** | machines + branches + routes overrides | `/api/machines`, `/api/branches`, `/api/routes` |
| **Optimization** | **Partial** | branch cash from UC via `/api/branch-inputs`; map/route geometry still client-derived | `/api/branch-inputs`, `/api/plan` |
| **Reports** | **Partial** | uses UC machines/branches/routes when loaded; export logic client-side | same APIs |
| **AI Performance** | **Not UC** | hardcoded / client demo metrics | — |
| **Alerts** | **Not UC** | derived in browser (+ synthetic padding) | — |
| **Scenario** | **Not UC** | client what-if simulator | — |
| ~~Configure Inputs~~ | Removed | — | — |

**Verdict:** Operational pages (Machines, Branches, Routes, Truck Detail) are fully driven by Unity Catalog. Overview/Optimization/Reports mix UC facts with client-derived KPIs. AI / Alerts / Scenario are not warehouse-backed.

---

## Entity inventory (contract views)

| View | Rows (latest date) | Powers | Key fields → UI |
|---|---:|---|---|
| `app_settings` | 1 | Date/region resolution (`auto`), fleet defaults | `business_date`, `region_code`, truck/cost params |
| `machine_snapshot` | 48 | Machines table, map, Overview machine KPIs | `machine_id`, cash, capacity, action, health, risk, lat/lng |
| `machine_daily_flow` | 672 | Machine trend charts | `series_date`, deposit/withdraw/net, `value_type` |
| `machine_denomination` | 192 | Machine denomination donut | `denomination_thb`, `predicted_mix_pct` |
| `branch_snapshot` | 15 | Branches table/map, Configure inputs (API), plan overlay | `branch_code`, cash, deposit/withdraw, action, capacity, depot flag |
| `branch_daily_flow` | 196 | Branch trend charts | same pattern as machine flow |
| `branch_denomination_gap` | 56 | Branch denomination gap chart | surplus/shortfall by note |
| `route_summary` | 4 | Route list KPIs, Truck Detail header | `route_id`, truck, status, distance, util, OPTIMIZED/ACTUAL |
| `route_stops` | 30 | Stop list + map path | `stop_sequence`, type, status, eta, amount, lat/lng |

All nine views are **MAPPED** to Delta tables under `cash_optimization_mock` and expose only the latest published `business_date`.

---

## UI surface detail

### Machines — UC
- API: `/api/machines` → `source=unity_catalog`
- Snapshot → id, location, current/predicted cash, action, health, risk, emergency
- Daily flow → trend (ACTUAL preferred over PREDICTED per day)
- Denomination → mix % for B1000/B500/B100/B50

### Branches — UC
- API: `/api/branches` (excludes depot) → `source=unity_catalog`
- Snapshot → vault position, forecast in/out, action, health
- Daily flow → trend
- Denomination gap → surplus/shortfall bars

### Route Tracking / Truck Detail — UC
- API: `/api/routes?plan_type=OPTIMIZED` → `source=unity_catalog`
- Summary → route KPIs, utilization, SLA, CIT cost
- Stops → ordered stops + polyline from lat/lng

### Overview — UC partial
- Uses UC machine + branch + route payloads when present
- Some KPI ribbons / utilization spark still synthesized client-side

### Optimization — UC partial
- Branch inputs from `/api/branch-inputs` (UC `branch_snapshot`, includes depot)
- Optimized vs actual geometry still from client planner seeded by those inputs
- `/api/plan` marks `dataSource=unity_catalog` when branch overlay succeeds

### AI Performance / Alerts / Scenario — not UC
| Page | Behavior |
|---|---|
| AI Performance | Fixed MAPE / acceptance / benefit numbers in frontend |
| Alerts | Built from loaded machines/branches/routes in browser; pads with fake “Other” alerts |
| Scenario | Re-runs client mock planner with assumption sliders |

---

## API → view matrix

| API | Views read | Returns |
|---|---|---|
| `GET /api/health` | resolves date via `app_settings` | catalog, schema, resolved `businessDate` |
| `GET /api/config` | same | connection info |
| `GET /api/machines` | machine_snapshot + machine_daily_flow + machine_denomination | Machine[] |
| `GET /api/branches` | branch_snapshot + branch_daily_flow + branch_denomination_gap | BranchTrack[] (no depot) |
| `GET /api/branch-inputs` | branch_snapshot | BranchInput[] (incl. depot) |
| `GET /api/routes` | route_summary + route_stops | RouteExecution[] |
| `GET /api/plan` | branch_snapshot (+ mock solver overlay) | PlanBundle |

---

## Freshness model

1. Upstream (or seed) writes a full slice into `cash_optimization_mock` for a new `business_date`.
2. Contract views automatically expose `MAX(business_date)` from `app_settings`.
3. App with `APP_BUSINESS_DATE=auto` queries that date.
4. **Browser reload** required to see new data (no live poll).

The date-roll job `KTB Cash App — Daily UC Refresh` (`908307639933387`) is **PAUSED**. Prefer publishing new dates upstream over rolling mock dates.

---

## Gaps / not in UC contract

| Gap | Impact | How to close |
|---|---|---|
| No AI metrics tables | AI Performance page is demo-only | Add model metrics views + API |
| No alert event table | Alerts page is derived/padded | Add `alerts` view + API |
| No dedicated ACTUAL route feed required for Machines/Branches | Comparison uses route_plan_type when present | Ensure both OPTIMIZED and ACTUAL in route_* |
| Optimization geometry client-side | Map may not match OR-Tools output 1:1 | Prefer `/api/routes` path; retire client solver |

---

## Related docs

- [`REQUIRED_DATA_FORMAT.md`](../REQUIRED_DATA_FORMAT.md) — column-level contract
- [`ktb-cash-optimization/REQUIRED_DATA_FORMAT.md`](../ktb-cash-optimization/REQUIRED_DATA_FORMAT.md) — same contract in deploy package
- Legacy Control Room inventory (different schema/UI): previous `cash_optimization_contract` dataplug run — superseded for the live KTB app by this map
