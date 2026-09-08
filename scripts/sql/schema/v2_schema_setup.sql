-- Baseline schema for the current /api/v2 backend (server/repositories/).
-- Follow with scripts/sql/migrations/v2_add_cost_of_fund.sql for Overview V2.
-- Contract and upstream differences: docs/data/runtime-schema.md.
-- CREATE TABLE IF NOT EXISTS does not upgrade existing tables.
-- Inspect and edit the catalog/schema below for your target before running.

CREATE SCHEMA IF NOT EXISTS ${catalog}.${schema};
USE CATALOG ${catalog};
USE SCHEMA ${schema};

-- ══ Branch domain ═════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dim_branch (
  branch_code       STRING NOT NULL,
  branch_name       STRING,
  district_name     STRING,
  center_id         STRING,
  latitude          DOUBLE,
  longitude         DOUBLE,
  cash_capacity_thb DECIMAL(18,2),
  min_threshold_thb DECIMAL(18,2),
  service_minutes   INT,              -- defaults to 20 if NULL
  window_start      STRING,           -- "HH:MM", defaults to "08:00" if NULL
  window_end        STRING,           -- "HH:MM", defaults to "17:00" if NULL
  updated_at        TIMESTAMP
) USING DELTA;

-- Joined to dim_branch on branch_code. MAX(business_date) here is the app's
-- default date for ALL branch views, so this table must be populated.
CREATE TABLE IF NOT EXISTS fact_cash_position (
  business_date          DATE NOT NULL,
  branch_code            STRING NOT NULL,
  actual_cash_d_minus_1  DECIMAL(18,2),   -- shown as opening cash
  predicted_cash_d       DECIMAL(18,2),
  predicted_deposit_d    DECIMAL(18,2),   -- shown as predicted inflow
  predicted_withdrawal_d DECIMAL(18,2),   -- shown as predicted outflow
  action_type            STRING,          -- DELIVERY | PICKUP | BOTH | NO_ACTION
  health_status          STRING,          -- HEALTHY | WATCH | ACTION_NEEDED | CRITICAL | NO_DATA
  emergency_flag         BOOLEAN,
  delivery_amount_thb    DECIMAL(18,2),   -- shown as fill amount
  updated_at             TIMESTAMP
) USING DELTA;

-- One row per branch per series_date; drives the 14-day trend sparklines.
CREATE TABLE IF NOT EXISTS fact_cash_flow_daily (
  business_date         DATE NOT NULL,
  branch_code           STRING NOT NULL,
  series_date           DATE NOT NULL,
  value_type            STRING,        -- ACTUAL | FORECAST (ACTUAL wins on duplicate days)
  deposit_amount_thb    DECIMAL(18,2),
  withdrawal_amount_thb DECIMAL(18,2),
  net_amount_thb        DECIMAL(18,2),
  remaining_amount_thb  DECIMAL(18,2),
  updated_at            TIMESTAMP
) USING DELTA;

-- One row per branch per denomination. Only 1000/500/100/50 are rendered.
CREATE TABLE IF NOT EXISTS fact_branch_denomination (
  business_date               DATE NOT NULL,
  branch_code                 STRING NOT NULL,
  denomination_thb            INT NOT NULL,
  target_note_count           INT,
  target_amount_thb           DECIMAL(18,2),
  target_mix_pct              DOUBLE,
  actual_note_count_d_minus_1 INT,
  actual_amount_thb_d_minus_1 DECIMAL(18,2),
  actual_mix_pct              DOUBLE,
  delivery_note_count         INT,
  delivery_amount_thb         DECIMAL(18,2),
  updated_at                  TIMESTAMP
) USING DELTA;

-- ══ Machine domain ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dim_machine (
  machine_id           STRING NOT NULL,
  machine_type         STRING,          -- ATM | RCM | 3IN1
  location_name        STRING,
  district_name        STRING,
  latitude             DOUBLE,
  longitude            DOUBLE,
  alltime_max_cash_thb DECIMAL(18,2),   -- used as the machine's capacity
  updated_at           TIMESTAMP
) USING DELTA;

-- MAX(business_date) here resolves machine views independently of branches.
CREATE TABLE IF NOT EXISTS fact_machine_position (
  business_date          DATE NOT NULL,
  machine_id             STRING NOT NULL,
  actual_cash_d_minus_1  DECIMAL(18,2),
  predicted_cash_d       DECIMAL(18,2),
  predicted_deposit_d    DECIMAL(18,2),
  predicted_withdrawal_d DECIMAL(18,2),
  action_type            STRING,        -- "Swap (Near Full)" | "Swap (Near Empty)" | anything else = No Action
  health_status          STRING,        -- same vocabulary as fact_cash_position
  emergency_flag         BOOLEAN,
  delivery_amount_thb    DECIMAL(18,2), -- cash added to the machine
  remove_amount_thb      DECIMAL(18,2), -- cash taken out
  updated_at             TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS fact_machine_flow_daily (
  business_date         DATE NOT NULL,
  machine_id            STRING NOT NULL,
  series_date           DATE NOT NULL,
  value_type            STRING,        -- ACTUAL | FORECAST
  deposit_amount_thb    DECIMAL(18,2),
  withdrawal_amount_thb DECIMAL(18,2),
  net_amount_thb        DECIMAL(18,2),
  updated_at            TIMESTAMP
) USING DELTA;

-- Only 1000/500/100 are rendered for machines (no 50s).
CREATE TABLE IF NOT EXISTS fact_machine_denomination (
  business_date                   DATE NOT NULL,
  machine_id                      STRING NOT NULL,
  denomination_thb                INT NOT NULL,
  alltime_max_note_count          INT,
  actual_note_count_d_minus_1     INT,
  actual_amount_thb_d_minus_1     DECIMAL(18,2),
  predicted_remaining_note_count  INT,   -- drives the donut chart
  predicted_remaining_amount_thb  DECIMAL(18,2),
  delivery_note_count             INT,
  delivery_amount_thb             DECIMAL(18,2),
  remove_note_count               INT,
  remove_amount_thb               DECIMAL(18,2),
  updated_at                      TIMESTAMP
) USING DELTA;

-- ══ Route domain ══════════════════════════════════════════════════════════

-- Read AND written: POST /api/v2/fleet/availability updates is_available.
CREATE TABLE IF NOT EXISTS dim_truck (
  truck_id          STRING NOT NULL,
  center_id         STRING,
  plate_number      STRING,
  cash_capacity_thb DECIMAL(18,2),
  is_available      BOOLEAN,
  updated_at        TIMESTAMP
) USING DELTA;

-- MAX(business_date) here resolves route views independently of branches.
-- truck_id doubles as the route identifier (one route per truck per day).
CREATE TABLE IF NOT EXISTS fact_route_summary (
  business_date               DATE NOT NULL,
  truck_id                    STRING NOT NULL,
  route_plan_type             STRING NOT NULL,  -- OPTIMIZED | ADJUSTED | ACTUAL (UI requests OPTIMIZED)
  plan_version                INT,
  depot_code                  STRING,
  depot_name                  STRING,
  depot_latitude              DOUBLE,
  depot_longitude             DOUBLE,
  route_status                STRING,           -- ON_TRACK | DELAYED | AT_RISK
  total_stops                 INT,
  completed_stops             INT,
  remaining_stops             INT,
  total_distance_km           DOUBLE,
  total_duration_minutes      INT,
  etd_start                   STRING,           -- "HH:MM:SS"
  eta_return                  STRING,           -- "HH:MM:SS"
  vehicle_capacity_thb        DECIMAL(18,2),
  vehicle_utilization_pct     DOUBLE,
  cash_on_board_thb           DECIMAL(18,2),
  delivery_amount_thb_branch  DECIMAL(18,2),
  delivery_amount_thb_machine DECIMAL(18,2),
  pickup_amount_thb_branch    DECIMAL(18,2),
  cost_of_transport           DECIMAL(18,2),
  cit_cost_thb                DECIMAL(18,2),
  sla_achievement_pct         DOUBLE,
  normal_hours                DOUBLE,
  ot_hours                    DOUBLE,
  fuel_cost_thb               DECIMAL(18,2),
  repair_cost_thb             DECIMAL(18,2),
  maintenance_cost_thb        DECIMAL(18,2),
  normal_wage_thb             DECIMAL(18,2),
  ot_wage_thb                 DECIMAL(18,2),
  machine_stops               INT,
  updated_at                  TIMESTAMP
) USING DELTA;

-- Ordered by stop_sequence; the lat/lng pairs also form the drawn route path.
CREATE TABLE IF NOT EXISTS fact_route_stop (
  business_date       DATE NOT NULL,
  truck_id            STRING NOT NULL,
  route_plan_type     STRING NOT NULL,
  stop_sequence       INT NOT NULL,     -- 0 = depot start
  stop_code           STRING,
  stop_name           STRING,
  stop_type           STRING,           -- Depot | Branch | ATM | RCM | 3IN1 | Other Bank
  action_type         STRING,           -- START | DELIVERY | PICKUP | SWAP | BOTH | RETURN
  stop_status         STRING,           -- PENDING | IN_PROGRESS | COMPLETED
  eta                 STRING,           -- "HH:MM:SS"
  etd                 STRING,
  delivery_amount_thb DECIMAL(18,2),
  pickup_amount_thb   DECIMAL(18,2),
  latitude            DOUBLE,
  longitude           DOUBLE,
  leg_km              DOUBLE,
  cumulative_km       DOUBLE,
  updated_at          TIMESTAMP
) USING DELTA;

-- ══ Config ════════════════════════════════════════════════════════════════

-- Required by Route Config (additional to the upstream workbook).
-- Read AND written: POST /api/v2/route-params updates value.
CREATE TABLE IF NOT EXISTS dim_route_parameter (
  parameter_type STRING,          -- grouping label in the UI
  parameter      STRING NOT NULL, -- the key updates match on
  description    STRING,
  value          DOUBLE,
  remark         STRING,
  updated_at     TIMESTAMP
) USING DELTA;
