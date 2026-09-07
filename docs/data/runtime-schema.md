# Runtime data contract

The current V2 setup consists of the [baseline DDL](../../scripts/sql/schema/v2_schema_setup.sql)
plus the [cost-of-fund migration](../../scripts/sql/migrations/v2_add_cost_of_fund.sql).
Apply them using the order in the [script guide](../../scripts/README.md).
`CREATE TABLE IF NOT EXISTS` alone does not upgrade an existing database.

The table list below is derived from those files. Query implementations live in
[server/repositories](../../server/repositories); validated HTTP models live in
[server/schemas/v2.py](../../server/schemas/v2.py). The
[upstream blueprint](database-table-blueprint.md) supplies source mapping context,
not a second executable schema.

## Tables

| Domain | Tables |
| --- | --- |
| Branch | `dim_branch`, `fact_cash_position`, `fact_cash_flow_daily`, `fact_branch_denomination` |
| Machine | `dim_machine`, `fact_machine_position`, `fact_machine_flow_daily`, `fact_machine_denomination` |
| Route | `dim_truck`, `fact_route_summary`, `fact_route_stop` |
| Configuration | `dim_route_parameter` |

There are 12 tables. `cost_of_fund_thb DECIMAL(18,2)` is added to both position
tables by the migration and read by Overview V2. Operational ingestion must
supply that daily value after the initial backfill.

## Date and API behavior

Branch views default to the latest `fact_cash_position.business_date`. Machine
tracking resolves its own latest position date, and route views resolve their
own latest summary date. An explicit `date` query selects the requested day.
Overview periods are 1, 7, 30, 90, or 365 days ending on the selected date.

The frontend consumes `/api/v2/branch-tracks`, `/machine-tracks`,
`/route-executions`, and `/branch-inputs` as UI-shaped envelopes. Raw resource
endpoints are separate contracts: the raw machine list, machine cash-flow, and
machine denomination-gap endpoints currently return empty lists, while machine
tracking does read the machine tables. Do not infer endpoint readiness from
whether a table exists.

Fleet availability and route parameters are written through `/api/v2/fleet/availability`
and `/api/v2/route-params`. Other operational data is supplied by ingestion.

## Baseline columns

Column lists below reproduce baseline DDL; types, nullability, and explanatory
comments remain in that SQL file. Migration additions are listed separately.

### `dim_branch`

`branch_code`, `branch_name`, `district_name`, `center_id`, `latitude`, `longitude`, `cash_capacity_thb`, `min_threshold_thb`, `service_minutes`, `window_start`, `window_end`, `updated_at`.

### `fact_cash_position`

`business_date`, `branch_code`, `actual_cash_d_minus_1`, `predicted_cash_d`, `predicted_deposit_d`, `predicted_withdrawal_d`, `action_type`, `health_status`, `emergency_flag`, `delivery_amount_thb`, `updated_at`.

Migration addition: `cost_of_fund_thb DECIMAL(18,2)`.

### `fact_cash_flow_daily`

`business_date`, `branch_code`, `series_date`, `value_type`, `deposit_amount_thb`, `withdrawal_amount_thb`, `net_amount_thb`, `remaining_amount_thb`, `updated_at`.

### `fact_branch_denomination`

`business_date`, `branch_code`, `denomination_thb`, `target_note_count`, `target_amount_thb`, `target_mix_pct`, `actual_note_count_d_minus_1`, `actual_amount_thb_d_minus_1`, `actual_mix_pct`, `delivery_note_count`, `delivery_amount_thb`, `updated_at`.

### `dim_machine`

`machine_id`, `machine_type`, `location_name`, `district_name`, `latitude`, `longitude`, `alltime_max_cash_thb`, `updated_at`.

### `fact_machine_position`

`business_date`, `machine_id`, `actual_cash_d_minus_1`, `predicted_cash_d`, `predicted_deposit_d`, `predicted_withdrawal_d`, `action_type`, `health_status`, `emergency_flag`, `delivery_amount_thb`, `remove_amount_thb`, `updated_at`.

Migration addition: `cost_of_fund_thb DECIMAL(18,2)`.

### `fact_machine_flow_daily`

`business_date`, `machine_id`, `series_date`, `value_type`, `deposit_amount_thb`, `withdrawal_amount_thb`, `net_amount_thb`, `updated_at`.

### `fact_machine_denomination`

`business_date`, `machine_id`, `denomination_thb`, `alltime_max_note_count`, `actual_note_count_d_minus_1`, `actual_amount_thb_d_minus_1`, `predicted_remaining_note_count`, `predicted_remaining_amount_thb`, `delivery_note_count`, `delivery_amount_thb`, `remove_note_count`, `remove_amount_thb`, `updated_at`.

### `dim_truck`

`truck_id`, `center_id`, `plate_number`, `cash_capacity_thb`, `is_available`, `updated_at`.

### `fact_route_summary`

`business_date`, `truck_id`, `route_plan_type`, `plan_version`, `depot_code`, `depot_name`, `depot_latitude`, `depot_longitude`, `route_status`, `total_stops`, `completed_stops`, `remaining_stops`, `total_distance_km`, `total_duration_minutes`, `etd_start`, `eta_return`, `vehicle_capacity_thb`, `vehicle_utilization_pct`, `cash_on_board_thb`, `delivery_amount_thb_branch`, `delivery_amount_thb_machine`, `pickup_amount_thb_branch`, `cost_of_transport`, `cit_cost_thb`, `sla_achievement_pct`, `normal_hours`, `ot_hours`, `fuel_cost_thb`, `repair_cost_thb`, `maintenance_cost_thb`, `normal_wage_thb`, `ot_wage_thb`, `machine_stops`, `updated_at`.

### `fact_route_stop`

`business_date`, `truck_id`, `route_plan_type`, `stop_sequence`, `stop_code`, `stop_name`, `stop_type`, `action_type`, `stop_status`, `eta`, `etd`, `delivery_amount_thb`, `pickup_amount_thb`, `latitude`, `longitude`, `leg_km`, `cumulative_km`, `updated_at`.

### `dim_route_parameter`

`parameter_type`, `parameter`, `description`, `value`, `remark`, `updated_at`.
