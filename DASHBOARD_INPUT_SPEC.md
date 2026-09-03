> ⚠️ **DEPRECATED (2026-08-26):** This document describes the ORIGINAL sample-file-based input mapping.
> It is superseded by [`database_table_blueprint.md`](database_table_blueprint.md) which defines
> the production Unity Catalog table schema (12 tables). Kept for historical reference only.

# Dashboard Input Specification — Tabs 1–4 (HISTORICAL)

**Scope:** Machines · Branches · Route Tracking · Truck Detail  
**Sample data source:** `~/Downloads/data_for_dashboard` (KCIM Khon Kaen export, 2026-07-08)  
**App:** `ktb-cash-route-app/frontend`

This document lists **what inputs each of the first four tabs needs**, how those inputs map to the customer sample files, and what is **derived in the UI** (not supplied as input).

---

## Summary

| Tab | Primary input object | Editable in app? | Main sample files |
|-----|---------------------|------------------|-------------------|
| **1. Machines** | `MachineInput[]` | Yes (per-machine table) | `P3_cross_p_signal.csv`, `P3_dim_stop_node.csv`, `P3_fact_cit_trip.csv` |
| **2. Branches** | `BranchInput[]` (+ shared `OptimizerParams`) | Yes (per-branch table) | `P2_forecast_buffer.csv`, `P2_daily_dispatch.csv`, `P2_backtest_detail.csv`, `DIM_branch_master.csv` |
| **3. Route Tracking** | Route plan JSON (`routes[]` with stops) | Yes (JSON editor) | `P3_route_plan.csv`, `P3_vrp_input.csv`, `P3_dim_vehicle.csv`, `P3_route_adherence.csv` |
| **4. Truck Detail** | Same as Tab 3 (one selected route) | No — read-only drill-down | Same as Tab 3 + live progress fields |

**Shared dimensions:** `DIM_branch_master.csv`, `DIM_calendar.csv`, `P3_distance_matrix.csv`

---

## Tab 1 — Machines

### Purpose

Track ATM / RCM cash health across Khon Kaen: map markers, KPI counts (cash-out risk, overflow, healthy), machine summary table, daily deposit/withdraw trend, denomination mix.

### Required inputs (`MachineInput`)

| Field | Type | Unit | Used for |
|-------|------|------|----------|
| `id` | string | — | Machine ID (e.g. `RCM-1007`, `ATM-NODE_0423`) |
| `location` | string | — | Venue / site name on map & table |
| `district` | string | — | District label |
| `lat` | number | degrees | Map pin |
| `lng` | number | degrees | Map pin |
| `currentCash` | number | THB | Current cassette balance; summary & map popup |
| `predictedEod` | number | THB | ML end-of-day forecast; drives action & risk |
| `cashCapacity` | number | THB | Cassette capacity; risk thresholds |
| `confidence` | number | % | ML confidence shown in table |

**Storage:** `localStorage` key `ktb-machines` (JSON array).

### Derived in app (not inputs today)

| Output | Derivation rule |
|--------|-----------------|
| `action` (Deliver / Pickup / No Action) | `predictedEod` vs `cashCapacity` bands (e.g. &lt;12% → Deliver, &gt;90% → Pickup) |
| `health` (Healthy / Watch / Action Needed / Critical) | Same bands, tighter for Critical |
| `riskLevel` (Very High → Low) | Same bands |
| `cashOutRisk` / `overflowRisk` KPIs | Count machines where `action` = Deliver / Pickup |
| `trend[]` (14-day deposit / withdraw / net) | **Mocked** from machine ID seed — not from editable input |
| `denomination` (B1000/B500/B100/B50 mix) | **Mocked** — not from editable input |

### Sample data mapping

The export has **443 ATM + 86 RCM** nodes (plus OTB/KTB/GOV). Join on `node_id`.

| App field | Sample source | Notes |
|-----------|---------------|-------|
| `id` | `P3_dim_stop_node.node_id` or `P3_fact_cit_trip.machine_code` | e.g. `NODE_0636` |
| `location` | `P3_dim_stop_node.location_name` | **Masked/removed** in export README — restore from prod |
| `district` | `P3_dim_stop_node.province` | Province used as district proxy |
| `lat`, `lng` | — | **Removed** in export — required from GIS / branch master |
| `currentCash` | Latest `P3_fact_cit_trip.total_loaded_thb` or box sum (`box_a_thb`…`box_d_thb`) | Per-machine last service load |
| `predictedEod` | `P3_cross_p_signal` + forecast | No direct EOD column; **proxy:** `currentCash − cash_to_collect_thb + cash_to_deliver_thb` or separate ATM ML model |
| `cashCapacity` | ATM model capacity table (not in export) | App default: ฿1M per RCM |
| `confidence` | `P2_metrics_by_horizon.csv` / model MAPE | Use horizon-specific accuracy or default % |

**Routing / risk signals (for enrichment):**

| Sample column | File | Maps to UI concept |
|---------------|------|-------------------|
| `stockout_risk_3d` | `P3_cross_p_signal` | Cash-out risk flag |
| `replen_trigger_today` | `P3_cross_p_signal` | Deliver trigger |
| `cash_to_deliver_thb` | `P3_cross_p_signal` | Planned deposit |
| `cash_to_collect_thb` | `P3_cross_p_signal` | Planned pickup |
| `emergency_rate_30d_pct` | `P3_cross_p_signal` | Emergency KPI (not on Machines tab today) |
| `routing_action` | `P3_cross_p_signal` | DELIVER / COLLECT / SKIP |

**Daily trend (recommended additional inputs):**

| Needed | Sample source | Columns |
|--------|---------------|---------|
| 14-day deposit / withdraw per machine | Not in export at machine grain | Branch-level proxy: `P2_forecast_buffer.pred_dep_adj`, `pred_wd_adj` joined via `br_id` if machine maps to branch |
| Historical actuals | `P3_fact_cit_trip` aggregated by `service_date`, `machine_code` | `total_loaded_thb`, `box_*_thb` |

**Denomination (recommended additional inputs):**

| Needed | Sample source |
|--------|---------------|
| Note mix / gap | `P2_denom_plan.csv` (`B1000`, `B500`, `B100`, `B50`, `B20`) — branch/event level; machine-level denom needs cassette telemetry |

### Minimum viable machine feed

```json
[
  {
    "id": "NODE_0636",
    "location": "Central Plaza ATM #3",
    "district": "ขอนแก่น",
    "lat": 16.4515,
    "lng": 102.814,
    "currentCash": 420000,
    "predictedEod": 180000,
    "cashCapacity": 1000000,
    "confidence": 92
  }
]
```

**Recommended extensions:** `trend[]`, `denomination`, `stockoutRisk3d`, `emergencyRate30d` from `P3_cross_p_signal`.

---

## Tab 2 — Branches

### Purpose

Branch cash positions, deliver/pickup actions, emergency KPI, health map, cash position daily trend (all-branches aggregate), denomination gap chart.

### Required inputs (`BranchInput`)

Branches share the global `AppConfig` with the Optimization tab. Editable on the Branches page:

| Field | Type | Unit | Used for |
|-------|------|------|----------|
| `code` | string | — | Branch code (e.g. `0211`) |
| `name` | string | — | Display name |
| `district` | string | — | District |
| `lat` | number | degrees | Map (from config; not in branch edit table) |
| `lng` | number | degrees | Map |
| `openingCash` | number | THB | **“Current cash”** in edit table |
| `predictedInflow` | number | THB | **“Deposit (inflow)”** — ML deposit forecast |
| `predictedOutflow` | number | THB | **“Withdraw (outflow)”** — ML withdrawal forecast |
| `cashCapacity` | number | THB | Vault capacity |
| `minThreshold` | number | THB | Minimum operating cash |
| `isDepot` | boolean | — | Cash center (excluded from branch tracking) |
| `serviceMinutes` | number | min | Optional — route dwell time |
| `windowStart` / `windowEnd` | string | HH:MM | Optional — CVRP time windows |

**Also used (Configure Inputs tab):** `OptimizerParams` — `replenishTargetPct`, `excessLinePct`, `keepPct`, etc., to derive status and demand.

**Storage:** `localStorage` key `ktb-config` (full `AppConfig` JSON).

### Derived in app

| Output | Derivation |
|--------|------------|
| `status` (REPLENISH / PICKUP / OK) | `projectedClosingCash = openingCash + inflow − outflow` vs thresholds & policy % |
| `demand` (signed THB) | Replenish target or pickup amount from policy |
| `action` / `health` / `emergency` on tracking view | From status + random emergency flag (demo) |
| `deposit` / `withdraw` columns | Copy of `predictedInflow` / `predictedOutflow` |
| `forecastNet` | `predictedInflow − predictedOutflow` |
| `trend[]` (14-day) | **Mocked** from branch inflow/outflow — not editable |
| `denominationGap` | **Mocked** |
| `confidence` | **Mocked** (90–99%) |

### Sample data mapping

Join key: **`br_id`** (e.g. `BR_001`) ↔ app `code` (customer maps pseudonym to real branch code).

| App field | Sample source | Columns |
|-----------|---------------|---------|
| `code` | `DIM_branch_master.br_id` | `BR_001` … `BR_049` |
| `name` | — | **Removed** in export |
| `district` | `DIM_branch_master.province` | Province |
| `lat`, `lng` | — | **Removed** — restore from prod |
| `cashCapacity` | `P2_backtest_detail.vault_capacity` | Per branch-day |
| `minThreshold` | `P2_backtest_detail.safety_stock` | Per branch-day |
| `openingCash` | `P2_backtest_detail.balance_after` or `P2_daily_dispatch.balance` | Start-of-day balance |
| `predictedInflow` | `P2_forecast_buffer.pred_dep_adj` | Horizon `1` = next service day |
| `predictedOutflow` | `P2_forecast_buffer.pred_wd_adj` | Horizon `1` |
| Deliver / pickup plan | `P2_daily_dispatch.fill_qty`, `collect_qty` | Confirms action amounts |
| Emergency flag | `P2_backtest_detail.emergency`, `stockout` | `1` = emergency |
| Branch tier / type | `DIM_branch_master.br_tier`, `br_loc_type` | Segmentation only |

**Daily trend (Cash Position Analysis):**

| Horizon | `P2_forecast_buffer` filter | Chart series |
|---------|----------------------------|--------------|
| h1–h14 | `forecast_date` = plan date, `horizon` = 1…14 | `pred_dep_adj` → deposit, `pred_wd_adj` → withdraw, `net_demand_adj` → net |

**Denomination gap:**

| Sample | Columns |
|--------|---------|
| `P2_denom_plan.csv` | `event_type`, `fill_qty`, `B1000`, `B500`, `B100`, `B50`, `B20` by `br_id`, `service_date` |

**Calendar context (optional):**

| File | Use |
|------|-----|
| `DIM_calendar.csv` | Payday, holiday, lottery flags — explain forecast spikes |

### Minimum viable branch feed

```json
{
  "code": "BR_017",
  "name": "Khon Kaen Branch",
  "district": "ขอนแก่น",
  "lat": 16.4322,
  "lng": 102.8395,
  "openingCash": 4466379,
  "predictedInflow": 4595594,
  "predictedOutflow": 4681349,
  "cashCapacity": 12000000,
  "minThreshold": 3500000
}
```

Filter sample rows: `P2_forecast_buffer` where `horizon = 1` and `forecast_date` = plan date.

---

## Tab 3 — Route Tracking

### Purpose

Fleet-level KPIs (routes, stops, distance, SLA, utilization, CIT cost), route map with deposit/pickup/cash-in-transit, route summary donut, active routes table, daily comparison, **editable route plan JSON**.

### Required inputs

#### A. Route plan JSON (primary — editable)

Schema version `1.0`. One object per truck/route:

```json
{
  "schemaVersion": "1.0",
  "unit": { "cash": "THB", "distance": "km", "time": "HH:MM (24h)" },
  "routes": [
    {
      "routeId": "Route 01",
      "truckId": "TRK-01",
      "zone": "Van 01 · South-East",
      "depot": "KTB Khon Kaen Cash Center",
      "vehicleCashCapacity": 70000000,
      "stops": [
        {
          "seq": 0,
          "code": "DEPOT",
          "location": "KTB Khon Kaen Cash Center",
          "type": "Start",
          "eta": "08:45",
          "amount": 0,
          "lat": 16.4419,
          "lng": 102.835
        },
        {
          "seq": 1,
          "code": "0277",
          "location": "Ban Phai Branch",
          "type": "Deliver",
          "eta": "10:21",
          "amount": 6510000,
          "lat": 16.06,
          "lng": 102.735
        },
        {
          "seq": 2,
          "code": "DEPOT",
          "location": "KTB Khon Kaen Cash Center",
          "type": "Return",
          "eta": "13:58",
          "amount": 0,
          "lat": 16.4419,
          "lng": 102.835
        }
      ]
    }
  ]
}
```

| Stop field | Type | Description |
|------------|------|-------------|
| `seq` | number | Order (0 = start depot) |
| `code` | string | Branch / node / `DEPOT` |
| `location` | string | Display name |
| `type` | enum | `Start` \| `Deliver` \| `Pickup` \| `Mixed` \| `Return` |
| `eta` | string | `HH:MM` planned or actual arrival |
| `amount` | number | Signed THB: **+ deliver**, **− pickup**, `0` depot |
| `lat`, `lng` | number | For map & distance |

**Storage:** `localStorage` key `ktb-route-input` (custom JSON overrides generated plan).

#### B. Supporting parameters (`OptimizerParams`)

Used when JSON is absent or to compute KPIs:

| Param | Sample proxy | Used for |
|-------|--------------|----------|
| `planDate` | `P3_route_plan.plan_date` | Header date |
| `costPerKmThb` | CIT tariff | CIT cost KPI |
| `avgSpeedKmh` | — | ETA / distance derivation |
| `roadFactor` | — | Straight-line → road km |
| `crewPerVehicle` | — | CIT cost KPI |
| `vanCashCapacity` | `P3_dim_vehicle.capacity_thb` | Utilization fallback |

#### C. Branch coordinates (for map)

From `BranchInput[]` or stop lat/lng in JSON. Sample: `P3_vrp_input.lat/lon` (**empty in export**).

### Derived in app

| Output | Source |
|--------|--------|
| `RouteExecution[]` | Parsed from JSON or built from optimized `PlanBundle` |
| Stop `status` (Completed / In Progress / Pending) | Demo clock `NOW_MIN = 13:20` vs `eta` |
| Route `status` (On Track / Delayed / At Risk) | Demo rule on route index |
| `distanceKm`, `distanceLeftKm` | OSRM road geometry or haversine × `roadFactor` |
| `cashOnBoard`, `deliveryAmount`, `pickupAmount` | Sum of stop `amount` by sign |
| `slaPct` | From exec metrics / plan |
| `utilizationPct` | `cashOnBoard / vehicleCapacity` averaged |
| `citCostThb` | `distance × costPerKm + crew × dailyRate` |
| Map **cash in transit** | Running onboard cash after each stop |
| Comparison table (before/after) | `PlanBundle.original` vs `optimized` |

### Sample data mapping

| App concept | Sample file | Columns |
|-------------|-------------|---------|
| Route assignment | `P3_route_plan.csv` | `plan_date`, `vehicle_code`, `stop_seq`, `node_id`, `routing_action`, `cash_to_deliver_thb`, `cash_to_collect_thb`, `est_arrival_time` |
| VRP node demand | `P3_vrp_input.csv` | `cash_to_deliver_thb`, `cash_to_collect_thb`, `must_serve_today`, `time_window_open/close`, `composite_priority` |
| Vehicle / capacity | `P3_dim_vehicle.csv` | `vehicle_code`, `vehicle_class`, `capacity_thb`, `primary_task` |
| Node metadata | `P3_dim_stop_node.csv` | `node_id`, `node_type`, `br_id_4d`, `time_window_*` |
| Routing signal | `P3_cross_p_signal.csv` | `routing_action` → DELIVER/COLLECT/SKIP |
| Distances | `P3_distance_matrix.csv` | Origin–destination km (444k rows) |
| Plan vs actual | `P3_route_adherence.csv` | `planned_stops`, `actual_stops`, `stop_completion_rate`, `has_emergency` |
| Historical trips | `P3_fact_cit_trip.csv` | Actual `stop_seq`, loads, `is_emergency` |

**Transform `P3_route_plan` → app JSON (per `vehicle_code`, ordered by `stop_seq`):**

| `P3_route_plan` | App stop field |
|-----------------|----------------|
| `est_arrival_time` | `eta` |
| `cash_to_deliver_thb` > 0 | `type: Deliver`, `amount: +value` |
| `cash_to_collect_thb` > 0 | `type: Pickup`, `amount: -value` |
| `routing_action = DEPOT` | `type: Start` or `Return` |
| `node_id` | `code` (join `P3_dim_stop_node` for name) |

Join keys: `vehicle_code` ↔ `truckId`, `node_id` ↔ stop `code`.

---

## Tab 4 — Truck Detail

### Purpose

Single-route drill-down: road map, ordered stop list with status/ETA/amount, vehicle capacity bar, cash on board / pickup / delivery totals.

### Required inputs

**Same route plan JSON as Tab 3** — no separate input surface. User selects `routeId` from the dropdown; data comes from the parsed `RouteExecution` for that route.

### Fields consumed per route (`RouteExecution`)

| Field | Source in JSON / derivation |
|-------|---------------------------|
| `routeId`, `truckId`, `label` | `routes[].routeId`, `truckId`, `zone` |
| `depot`, `depotLat`, `depotLng` | Start stop / `routes[].depot` |
| `stops[]` | Full ordered stop list |
| `totalStops`, `completed`, `remaining` | Count service stops vs demo progress |
| `distanceKm`, `distanceLeftKm` | Computed from path |
| `etaReturn` | Return stop `eta` |
| `vehicleCapacity` | `vehicleCashCapacity` or derived |
| `cashOnBoard`, `pickupAmount`, `deliveryAmount` | Aggregated from stops |
| `color`, `path` | UI palette + coordinates for OSRM map |
| `status` | On Track / Delayed / At Risk (demo) |

### Sample data for live tracking (not in app JSON today)

To replace demo progress with real GPS / CIT telemetry:

| Needed | Sample source |
|--------|---------------|
| Actual arrival time | `P3_fact_cit_trip.service_date` + stop sequence |
| Stop completion | `P3_route_adherence.stop_completion_rate`, `actual_stops` |
| Emergency en route | `P3_fact_cit_trip.is_emergency`, `P3_route_adherence.has_emergency` |
| Cash loaded per stop | `P3_fact_cit_trip.total_loaded_thb`, `box_*_thb` |

---

## Cross-tab data flow

```
                    ┌─────────────────────┐
                    │  DIM_branch_master  │
                    │  DIM_calendar       │
                    └──────────┬──────────┘
                               │ br_id
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ P2_forecast_*   │  │ P2_daily_dispatch│  │ P2_denom_plan   │
│ (ML WD/DEP)     │  │ (fill/collect)   │  │ (note mix)      │
└────────┬────────┘  └────────┬────────┘  └─────────────────┘
         │                    │
         └────────┬───────────┘
                  ▼
         Tab 2: BranchInput[]
                  │
                  │ demand, coords, windows
                  ▼
         ┌─────────────────┐      ┌─────────────────┐
         │ P3_vrp_input    │─────▶│ P3_route_plan   │
         │ P3_cross_p_sig  │      │ (OR-Tools out)  │
         └─────────────────┘      └────────┬────────┘
                                           │
                  ┌────────────────────────┘
                  ▼
         Tab 3/4: Route JSON → RouteExecution[]
                  ▲
         ┌────────┴────────┐
         │ P3_dim_vehicle  │
         │ P3_distance_mtx │
         └─────────────────┘

┌─────────────────┐
│ P3_cross_p_sig  │─── node_id ───▶ Tab 1: MachineInput[]
│ P3_fact_cit_trip│    (ATM/RCM)
│ P3_dim_stop_node│
└─────────────────┘
```

---

## Gaps: sample data vs current app

| Visualization | Tab | In sample data? | In app editable input? | Action |
|---------------|-----|-----------------|------------------------|--------|
| 14-day machine trend | 1 | Branch-level only (`P2_forecast_buffer`) | No — mocked | Add `trend[]` to `MachineInput` or join ATM→branch |
| Denomination mix | 1 | `P2_denom_plan` (branch) | No — mocked | Machine cassette telemetry or branch denom |
| Emergency flag | 2 | `P2_backtest_detail.emergency` | No — random | Add `emergency: boolean` to `BranchInput` |
| Confidence % | 2 | Model metrics | No — mocked | Horizon MAPE → confidence |
| Denomination gap | 2 | `P2_denom_plan` | No — mocked | Load denom plan per branch |
| Live stop status | 3, 4 | `P3_route_adherence`, `P3_fact_cit_trip` | No — time simulation | Feed actual ETAs / completion |
| Lat/lon | All | **Removed** in export | Required in app | Restore from secure GIS |
| Branch names | 2 | **Removed** | Required | Restore from master |

---

## Recommended ingestion order

1. **Dimensions** — `DIM_branch_master`, `P3_dim_stop_node`, `P3_dim_vehicle`
2. **Tab 2** — `P2_forecast_buffer` (h=1) + `P2_daily_dispatch` → `BranchInput[]`
3. **Tab 1** — Filter `P3_cross_p_signal` to `ATM`/`RCM` → `MachineInput[]`; enrich with `P3_fact_cit_trip` for `currentCash`
4. **Tab 3/4** — Pivot `P3_route_plan` by `vehicle_code` → route JSON; attach coords from branch/node master
5. **Optional** — `P2_forecast_buffer` h1–14 for branch trends; `P2_denom_plan` for denom charts; `P3_route_adherence` for live status

---

## File reference (sample export)

| File | Rows | Pillar |
|------|------|--------|
| `DIM_branch_master.csv` | 56 | Shared |
| `DIM_calendar.csv` | 2,557 | Shared |
| `P2_forecast_buffer.csv` | 686 | Branch ML forecast |
| `P2_daily_dispatch.csv` | 686 | Branch dispatch plan |
| `P2_denom_plan.csv` | 231 | Denomination |
| `P2_backtest_detail.csv` | 5,880 | Backtest actuals |
| `P2_model_metrics.csv` | 2 | Model accuracy |
| `P2_metrics_by_horizon.csv` | 14 | Accuracy by horizon |
| `P3_route_plan.csv` | 681 | VRP output |
| `P3_vrp_input.csv` | 814 | VRP input |
| `P3_cross_p_signal.csv` | 814 | Routing signals |
| `P3_dim_stop_node.csv` | 814 | Stop dimension |
| `P3_dim_vehicle.csv` | 28 | Fleet |
| `P3_distance_matrix.csv` | 444,222 | Travel matrix |
| `P3_fact_cit_trip.csv` | 43,932 | Historical CIT |
| `P3_route_adherence.csv` | 5,490 | Plan vs actual |

**Join keys:** `br_id`, `vehicle_code`, `node_id`  
**Confidentiality:** Branch names and lat/lon are masked/removed in the sample export — production feeds must restore them.

---

*Generated for KTB Cash Route Optimization dashboard · Khon Kaen POC*
