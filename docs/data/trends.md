# Operational trends

Use **View Trends** within each tab: Machines opens `/machines/trends`, Branches opens `/branches/trends`, and Route Tracking opens `/routes/trends`. Each is dedicated to its own dataset, with no shared Trends navigation or dataset switcher. The parent tab stays active in the sidebar. Each dataset has its own latest available date, and the date picker only enables that dataset's available dates. Switching periods retains the chosen end date. Old `/trends/{dataset}` bookmarks redirect to the corresponding dedicated page, preserving filters.

The API is `GET /api/v2/trends/{branches|machines|routes}?period=week&end=2026-09-07`. End is optional. Periods `3days`, `week`, `month`, `quarter`, `year` are rolling inclusive windows of 3, 7, 30, 90 and 365 days, rather than calendar month/year buckets. The comparison is the immediately preceding window with the same number of days.

## Aggregation rules

The KPI cards on Branches, Machines and Route Tracking have a separate daily comparison: the selected (or dataset latest) date versus exactly seven days earlier. This is a day-to-day comparison, not a seven-day total. Machine type filters apply to both dates. Missing historical snapshots remain unavailable; zero or negative baselines do not produce relative percentage changes. Rate comparisons use percentage points. These replace the old hardcoded Branches badges.

- Cash positions: one row per entity and planning date, latest `updated_at`. Forecast deposits, withdrawals and closing balances come from position facts for both branches and machines.
- Actual flows: filter `value_type = 'ACTUAL'`, select the latest snapshot on or before the selected end date for each entity and `series_date`, breaking ties by `updated_at`. Aggregate by `series_date`. Repeated overlapping snapshots are never added together. Selecting an earlier end date excludes subsequent snapshot corrections. Forecast rows in flow facts are not used.
- Denominations: latest row per entity, planning date and denomination. Balances use actual THB amounts from the previous day; mix is the share of those amounts, not note counts or an average of stored percentages. Missing denominations or a different entity count from positions make denomination totals unavailable.
- Routes: `OPTIMIZED` only, highest plan version per truck and date, then latest update. Costs, hours, distance and cash movements describe plans. Completion and SLA are recorded fields, not inferred real execution.
- Flows, planned movements, costs, route stops, distance and hours: sum over available days. Balances, health/action counts and active entities: daily average. Charts always display daily aggregates.
- Rates: sum of numerators divided by sum of valid denominators. Cash utilization uses current dimension capacities across entity-days; route utilization weights stored percentages by vehicle capacity across route-days. Historical capacity versions are not available. Completion is completed/planned service stops. SLA is explicitly a mean reported route percentage; no underlying on-time numerator exists.
- Percentages are returned on a 0–100 scale (65 means 65%). Utilization can exceed 100% if source amounts exceed capacity; it is not clamped. Changes in percentage metrics are **percentage points**, while other metrics use relative percentage change.
- Nulls and missing dates remain unknown, distinct from real zeros. Values include current and preceding day coverage. Comparisons require full daily coverage in both windows. Relative changes are unavailable for zero or negative preceding values; missing denominators also remain unavailable.

All queries are read-only and use the existing connection pool/cache. One trends request uses one connection at a time and returns at most 365 plotted days. No forecast is generated in the browser. Current configuration tables have no dated history, so configuration changes are not presented as historical trends.

Validation: unit tests cover inclusive/leap-year windows, weighted percentages, percentage-point changes, zero/missing baselines, error handling and actual-flow snapshot selection. Live checks cover all three datasets and the annual boundary.
