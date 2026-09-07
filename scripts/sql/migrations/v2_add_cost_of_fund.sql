-- Adds cost_of_fund_thb to the position tables.
--
-- Documented in docs/data/database-table-blueprint.md and queried by
-- fetch_overview_summary (Overview V2), but missing from the first cut of
-- v2_schema_setup.sql, which was derived only from the queries read at the
-- time. Daily cost of holding idle cash = balance * annual rate / 365,
-- using the cost_of_fund_annual parameter (0.0325) seeded in
-- dim_route_parameter.

USE CATALOG mdp_dev_dit;
USE SCHEMA default;

ALTER TABLE fact_cash_position ADD COLUMNS (cost_of_fund_thb DECIMAL(18,2));
ALTER TABLE fact_machine_position ADD COLUMNS (cost_of_fund_thb DECIMAL(18,2));

UPDATE fact_cash_position
SET cost_of_fund_thb = CAST(actual_cash_d_minus_1 * 0.0325 / 365 AS DECIMAL(18,2));

UPDATE fact_machine_position
SET cost_of_fund_thb = CAST(actual_cash_d_minus_1 * 0.0325 / 365 AS DECIMAL(18,2));
