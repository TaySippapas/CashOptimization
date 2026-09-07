-- Full setup for ktb_cash_route.ops: catalog/schema/volume, staging tables,
-- load from mock_data/*.csv (uploaded to the volume first), dim/fact tables,
-- and the staging -> dim/fact transform. Re-runnable (idempotent).
--
-- Prereq: upload the CSVs first —
--   databricks fs cp mock_data/ dbfs:/Volumes/mdp_dev_dit/default/landing/ --recursive -p <profile>
--
-- Run via server/sql_client.py (execute_many), splitting on ';', or paste
-- into a Databricks SQL editor. See docs/archive/DATABRICKS_NEW_PIPELINE_PROCEDURE.md for
-- the full walkthrough and design notes.

CREATE SCHEMA IF NOT EXISTS mdp_dev_dit.default;
CREATE VOLUME IF NOT EXISTS mdp_dev_dit.default.landing;

USE CATALOG mdp_dev_dit;
USE SCHEMA default;

-- ── Staging tables (schema = CSV header, verbatim) ─────────────────────────

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

-- ── Load staging from the volume ───────────────────────────────────────────
-- NOTE: COPY INTO an existing typed Delta table throws
-- [DELTA_FAILED_TO_MERGE_FIELDS] here (the CSV's default STRING-inferred
-- schema fails to reconcile against the target's typed columns). Use
-- read_files() instead — it infers real types (DATE/DOUBLE/BOOLEAN) directly
-- and INSERT INTO does a normal positional cast, no merge involved.

TRUNCATE TABLE stg_branch_snapshot;
INSERT INTO stg_branch_snapshot
SELECT business_date, region_code, branch_code, branch_name, district_name,
       latitude, longitude, is_depot, cash_capacity_thb, minimum_threshold_thb,
       actual_cash_d_minus_1, predicted_cash_d, predicted_deposit_d, predicted_withdrawal_d,
       action_type, health_status, emergency_flag
FROM read_files('/Volumes/mdp_dev_dit/default/landing/app_branch_snapshot.csv', format => 'csv', header => true);

TRUNCATE TABLE stg_machine_snapshot;
INSERT INTO stg_machine_snapshot
SELECT business_date, region_code, machine_id, machine_type, location_name,
       latitude, longitude, cash_capacity_thb, minimum_threshold_thb,
       actual_cash_d_minus_1, predicted_cash_d, deposit_amount_d, withdrawal_amount_d,
       action_type, health_status
FROM read_files('/Volumes/mdp_dev_dit/default/landing/app_machine_snapshot.csv', format => 'csv', header => true);

TRUNCATE TABLE stg_branch_daily_flow;
INSERT INTO stg_branch_daily_flow
SELECT business_date, region_code, branch_code, series_date, value_type,
       deposit_amount_thb, withdrawal_amount_thb, net_amount_thb, remaining_amount_thb
FROM read_files('/Volumes/mdp_dev_dit/default/landing/app_branch_daily_flow.csv', format => 'csv', header => true);

TRUNCATE TABLE stg_machine_daily_flow;
INSERT INTO stg_machine_daily_flow
SELECT business_date, region_code, machine_id, series_date, value_type,
       deposit_amount_thb, withdrawal_amount_thb, net_amount_thb, remaining_amount_thb
FROM read_files('/Volumes/mdp_dev_dit/default/landing/app_machine_daily_flow.csv', format => 'csv', header => true);

TRUNCATE TABLE stg_branch_denom_gap;
INSERT INTO stg_branch_denom_gap
SELECT business_date, region_code, branch_code, denomination_thb, predicted_note_count,
       predicted_amount_thb, predicted_mix_pct, actual_note_count, actual_mix_pct,
       gap_note_count, gap_amount_thb
FROM read_files('/Volumes/mdp_dev_dit/default/landing/app_branch_denomination_gap.csv', format => 'csv', header => true);

TRUNCATE TABLE stg_machine_denom_gap;
INSERT INTO stg_machine_denom_gap
SELECT business_date, region_code, machine_id, denomination_thb, predicted_note_count,
       predicted_amount_thb, predicted_mix_pct, actual_note_count, actual_mix_pct,
       gap_note_count, gap_amount_thb
FROM read_files('/Volumes/mdp_dev_dit/default/landing/app_machine_denomination.csv', format => 'csv', header => true);

TRUNCATE TABLE stg_route_summary;
INSERT INTO stg_route_summary
SELECT business_date, region_code, route_id, plan_version, route_plan_type, vehicle_id,
       driver_name, total_stops, total_distance_km, cost_of_transport,
       total_cash_delivered, total_cash_collected, updated_by, updated_at
FROM read_files('/Volumes/mdp_dev_dit/default/landing/app_route_summary.csv', format => 'csv', header => true);

TRUNCATE TABLE stg_route_stops;
INSERT INTO stg_route_stops
SELECT business_date, region_code, route_id, plan_version, route_plan_type, stop_sequence,
       location_id, location_type, action_type, cash_delivered_thb, cash_collected_thb,
       eta_time, leg_km, cumulative_km
FROM read_files('/Volumes/mdp_dev_dit/default/landing/app_route_stops.csv', format => 'csv', header => true);

-- ── Dimension / fact target tables ─────────────────────────────────────────

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
  window_start      STRING,
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
  plan_type         STRING NOT NULL,
  route_label       STRING,
  truck_id          STRING,
  driver_name       STRING,
  depot_code        STRING,
  route_status      STRING,
  total_stops       INT,
  total_distance_km DOUBLE,
  cost_of_transport_thb    DECIMAL(18,2),
  total_cash_delivered_thb DECIMAL(18,2),
  total_cash_collected_thb DECIMAL(18,2),
  vehicle_capacity_thb DECIMAL(18,2),
  route_color_hex   STRING,
  updated_at        TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS fact_cash_position (
  business_date       DATE NOT NULL,
  entity_type         STRING NOT NULL,
  entity_code         STRING NOT NULL,
  opening_cash_thb    DECIMAL(18,2),
  predicted_cash_thb  DECIMAL(18,2),
  predicted_inflow_thb  DECIMAL(18,2),
  predicted_outflow_thb DECIMAL(18,2),
  action_type         STRING,
  health_status        STRING,
  risk_level           STRING,
  prediction_confidence DOUBLE,
  emergency_flag        BOOLEAN,
  model_id              STRING,
  model_version          STRING,
  updated_at             TIMESTAMP
) USING DELTA
PARTITIONED BY (business_date);

CREATE TABLE IF NOT EXISTS fact_cash_flow_daily (
  business_date       DATE NOT NULL,
  entity_type         STRING NOT NULL,
  entity_code         STRING NOT NULL,
  series_date         DATE NOT NULL,
  value_type          STRING NOT NULL,
  deposit_amount_thb    DECIMAL(18,2),
  withdrawal_amount_thb DECIMAL(18,2),
  net_amount_thb         DECIMAL(18,2),
  remaining_amount_thb   DECIMAL(18,2),
  updated_at              TIMESTAMP
) USING DELTA
PARTITIONED BY (business_date);

CREATE TABLE IF NOT EXISTS fact_denomination_gap (
  business_date        DATE NOT NULL,
  entity_type           STRING NOT NULL,
  entity_code            STRING NOT NULL,
  denomination_thb        INT NOT NULL,
  predicted_note_count      INT,
  predicted_amount_thb       DECIMAL(18,2),
  predicted_mix_pct           DOUBLE,
  actual_note_count             INT,
  actual_mix_pct                 DOUBLE,
  gap_note_count                   INT,
  gap_amount_thb                    DECIMAL(18,2),
  updated_at                        TIMESTAMP
) USING DELTA
PARTITIONED BY (business_date);

CREATE TABLE IF NOT EXISTS fact_route_stop (
  business_date   DATE NOT NULL,
  route_id        STRING NOT NULL,
  plan_type       STRING NOT NULL,
  stop_sequence   INT NOT NULL,
  stop_code       STRING,
  stop_name       STRING,
  stop_type       STRING,
  stop_status     STRING,
  eta             STRING,
  amount_thb      DECIMAL(18,2),
  latitude        DOUBLE,
  longitude       DOUBLE,
  leg_km          DOUBLE,
  cumulative_km   DOUBLE,
  updated_at      TIMESTAMP
) USING DELTA
PARTITIONED BY (business_date);

-- ── Transform staging -> dim/fact ───────────────────────────────────────────

TRUNCATE TABLE dim_branch;
INSERT INTO dim_branch
SELECT branch_code, branch_name, district_name, region_code, latitude, longitude,
       is_depot, cash_capacity_thb, minimum_threshold_thb,
       NULL, NULL, NULL,
       current_timestamp()
FROM stg_branch_snapshot;

TRUNCATE TABLE dim_machine;
INSERT INTO dim_machine
SELECT machine_id, machine_type, location_name, NULL, region_code, latitude, longitude,
       cash_capacity_thb, current_timestamp()
FROM stg_machine_snapshot;

TRUNCATE TABLE fact_cash_position;
INSERT INTO fact_cash_position
SELECT business_date, 'BRANCH', branch_code, actual_cash_d_minus_1, predicted_cash_d,
       predicted_deposit_d, predicted_withdrawal_d,
       CASE action_type WHEN 'NO GO' THEN 'NO_ACTION' ELSE action_type END,
       health_status, NULL, NULL, emergency_flag, NULL, NULL, current_timestamp()
FROM stg_branch_snapshot
UNION ALL
SELECT business_date, 'MACHINE', machine_id, actual_cash_d_minus_1, predicted_cash_d,
       deposit_amount_d, withdrawal_amount_d,
       CASE action_type WHEN 'NO GO' THEN 'NO_ACTION' ELSE action_type END,
       health_status, NULL, NULL, FALSE, NULL, NULL, current_timestamp()
FROM stg_machine_snapshot;

TRUNCATE TABLE fact_cash_flow_daily;
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

TRUNCATE TABLE fact_denomination_gap;
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

TRUNCATE TABLE dim_route;
INSERT INTO dim_route
SELECT s.route_id, s.business_date, s.route_plan_type, s.route_id AS route_label,
       s.vehicle_id, s.driver_name,
       (SELECT rs.location_id FROM stg_route_stops rs
        WHERE rs.route_id = s.route_id AND rs.location_type = 'DEPOT' LIMIT 1) AS depot_code,
       'ON_TRACK', s.total_stops, s.total_distance_km, s.cost_of_transport,
       s.total_cash_delivered, s.total_cash_collected,
       NULL, NULL, current_timestamp()
FROM stg_route_summary s;

TRUNCATE TABLE fact_route_stop;
INSERT INTO fact_route_stop
SELECT rs.business_date, rs.route_id, rs.route_plan_type, rs.stop_sequence, rs.location_id,
       COALESCE(b.branch_name, m.location_name, 'Depot') AS stop_name,
       CASE WHEN rs.location_type = 'DEPOT' THEN 'START'
            WHEN rs.action_type = 'DELIVERY' THEN 'DELIVER'
            WHEN rs.action_type = 'NO GO' THEN 'MIXED'
            ELSE rs.action_type END,
       NULL,
       date_format(rs.eta_time, 'HH:mm'),
       rs.cash_delivered_thb - rs.cash_collected_thb,
       COALESCE(b.latitude, m.latitude) AS latitude,
       COALESCE(b.longitude, m.longitude) AS longitude,
       rs.leg_km, rs.cumulative_km, current_timestamp()
FROM stg_route_stops rs
LEFT JOIN dim_branch  b ON rs.location_id = b.branch_code
LEFT JOIN dim_machine m ON rs.location_id = m.machine_id;
