# Original KTB UI — Data Readiness Report

Adapter / app schema: `stable_classic_nan_fe_vm_catalog.cash_optimization_views`  
Source tables: `stable_classic_nan_fe_vm_catalog.cash_optimization_mock`  
Active date: latest `business_date` via view filter (`2026-07-30` as of last check)

Full inventory: [`data_map_inventory.md`](data_map_inventory.md)

## Summary

| Status | Surfaces |
|---|---|
| **UC-backed** | Machines, Branches, Route Tracking, Truck Detail |
| **UC partial** | Overview, Optimization, Reports |
| **Not UC** | AI Performance, Alerts, Scenario |
| **Removed** | Configure Inputs |

## UI surfaces

| Surface | Status | Source | Detail |
|---|---|---|---|
| Machines | **MAPPED** | `machine_snapshot` + `machine_daily_flow` + `machine_denomination` | Estate, cash, trends, denom mix from UC |
| Branches | **MAPPED** | `branch_snapshot` + `branch_daily_flow` + `branch_denomination_gap` | Vault position, trends, denom gaps from UC |
| Route Tracking | **MAPPED** | `route_summary` + `route_stops` | Optimized routes/stops from UC |
| Truck Detail | **MAPPED** | same as routes | Stop list + path from UC |
| Overview | **PARTIAL** | UC overrides for machines/branches/routes | Some KPI chrome still client-side |
| Optimization | **PARTIAL** | UC branch inputs + client planner | Geometry not pure UC |
| Reports | **PARTIAL** | Uses loaded UC datasets | Export assembly in browser |
| AI Performance | **MISSING** | client demo | No UC metrics API |
| Alerts | **MISSING** | client derived + pad | No alert event table |
| Scenario | **DERIVED** | client simulation | What-if only |

## Customer handoff

1. Land daily slices in source tables matching [`REQUIRED_DATA_FORMAT.md`](../REQUIRED_DATA_FORMAT.md).
2. Point contract views at those tables (latest-date filter already in place).
3. Keep `APP_BUSINESS_DATE=auto`.
4. Reload the dashboard after new dates land.
