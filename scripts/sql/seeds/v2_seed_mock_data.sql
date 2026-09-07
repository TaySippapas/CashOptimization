-- One year of mock data for the /api/v2 schema (see v2_schema_setup.sql).
--
-- Generated entirely server-side: a date spine crossed with the entity lists,
-- so nothing large crosses the wire. Values are deterministic — derived from
-- pmod(hash(...)) rather than rand() — so re-running produces identical data.
--
-- Re-runnable: every table is truncated first.
--
-- Branch names/coordinates match frontend/src/mocks/branches.ts so the map
-- lines up with the client-side mock the app falls back to.

USE CATALOG mdp_dev_dit;
USE SCHEMA default;

-- ══ Reference views ═══════════════════════════════════════════════════════

CREATE OR REPLACE TEMPORARY VIEW v_branch AS
SELECT * FROM VALUES
  ('0211', 'Khon Kaen Branch',        'Mueang Khon Kaen', 16.4322, 102.8236, 22000000, 25),
  ('0663', 'Central Plaza Khon Kaen', 'Mueang Khon Kaen', 16.4515, 102.8140, 24000000, 25),
  ('0451', 'Khon Kaen University',    'Mueang Khon Kaen', 16.4749, 102.8226, 20000000, 25),
  ('0512', 'Big C Khon Kaen',         'Mueang Khon Kaen', 16.4198, 102.8489, 23000000, 25),
  ('0338', 'Pratumuang Branch',       'Mueang Khon Kaen', 16.4291, 102.8305, 18000000, 25),
  ('0277', 'Ban Phai Branch',         'Ban Phai',         16.0600, 102.7350, 13000000, 35),
  ('0421', 'Chum Phae Branch',        'Chum Phae',        16.5430, 102.1000, 14000000, 35),
  ('0389', 'Nam Phong Branch',        'Nam Phong',        16.7050, 102.8620, 12000000, 35),
  ('0402', 'Nong Rua Branch',         'Nong Rua',         16.4990, 102.4420, 12000000, 35),
  ('0455', 'Mancha Khiri Branch',     'Mancha Khiri',     16.2000, 102.5330, 11000000, 35),
  ('0498', 'Kranuan Branch',          'Kranuan',          16.7100, 103.0900, 13000000, 35),
  ('0533', 'Phu Wiang Branch',        'Phu Wiang',        16.6600, 102.3600, 11000000, 35),
  ('0547', 'Ubol Ratana Branch',      'Ubol Ratana',      16.7700, 102.6200, 12000000, 35),
  ('0561', 'Nong Song Hong Branch',   'Nong Song Hong',   15.8300, 102.7700, 11000000, 35)
AS t(branch_code, branch_name, district_name, latitude, longitude, cash_capacity_thb, service_minutes);

CREATE OR REPLACE TEMPORARY VIEW v_machine AS
SELECT * FROM VALUES
  ('ATM-KK-001', 'ATM',  'KKU Main Gate',            'Mueang Khon Kaen', 16.4742, 102.8210, 2500000),
  ('ATM-KK-002', 'ATM',  'Central Plaza L1',         'Mueang Khon Kaen', 16.4512, 102.8145, 3000000),
  ('RCM-KK-003', 'RCM',  'Khon Kaen Railway Station','Mueang Khon Kaen', 16.4340, 102.8290, 3500000),
  ('ATM-KK-004', 'ATM',  'Big C Ring Road',          'Mueang Khon Kaen', 16.4201, 102.8492, 2500000),
  ('3IN1-KK-005','3IN1', 'Khon Kaen Hospital',       'Mueang Khon Kaen', 16.4388, 102.8331, 4000000),
  ('ATM-KK-006', 'ATM',  'Fairy Plaza',              'Mueang Khon Kaen', 16.4265, 102.8352, 2000000),
  ('RCM-KK-007', 'RCM',  'Ban Phai Market',          'Ban Phai',         16.0610, 102.7362, 3000000),
  ('ATM-KK-008', 'ATM',  'Chum Phae Town',           'Chum Phae',        16.5441, 102.1012, 2000000),
  ('ATM-KK-009', 'ATM',  'Nam Phong District',       'Nam Phong',        16.7061, 102.8631, 2000000),
  ('RCM-KK-010', 'RCM',  'Kranuan Plaza',            'Kranuan',          16.7112, 103.0911, 2500000),
  ('ATM-KK-011', 'ATM',  'Nong Rua Market',          'Nong Rua',         16.5001, 102.4431, 1800000),
  ('3IN1-KK-012','3IN1', 'Ubol Ratana Dam',          'Ubol Ratana',      16.7711, 102.6212, 3000000)
AS t(machine_id, machine_type, location_name, district_name, latitude, longitude, alltime_max_cash_thb);

CREATE OR REPLACE TEMPORARY VIEW v_truck AS
SELECT * FROM VALUES
  ('CC2-01', 'กข 1234 ขก', 30000000),
  ('CC2-02', 'กค 5678 ขก', 30000000),
  ('CC2-03', 'กง 9012 ขก', 25000000)
AS t(truck_id, plate_number, cash_capacity_thb);

-- 365 business dates ending today
CREATE OR REPLACE TEMPORARY VIEW v_date AS
SELECT explode(sequence(date_sub(current_date(), 364), current_date(), interval 1 day)) AS business_date;

-- ══ Dimensions ════════════════════════════════════════════════════════════

TRUNCATE TABLE dim_branch;
INSERT INTO dim_branch
SELECT
  branch_code, branch_name, district_name, '006CC2' AS center_id,
  latitude, longitude,
  CAST(cash_capacity_thb AS DECIMAL(18,2)),
  CAST(cash_capacity_thb * 0.15 AS DECIMAL(18,2)) AS min_threshold_thb,
  service_minutes,
  '08:30' AS window_start,
  '16:30' AS window_end,
  current_timestamp()
FROM v_branch;

TRUNCATE TABLE dim_machine;
INSERT INTO dim_machine
SELECT
  machine_id, machine_type, location_name, district_name,
  latitude, longitude,
  CAST(alltime_max_cash_thb AS DECIMAL(18,2)),
  current_timestamp()
FROM v_machine;

TRUNCATE TABLE dim_truck;
INSERT INTO dim_truck
SELECT
  truck_id, '006CC2' AS center_id, plate_number,
  CAST(cash_capacity_thb AS DECIMAL(18,2)),
  TRUE AS is_available,
  current_timestamp()
FROM v_truck;

TRUNCATE TABLE dim_route_parameter;
INSERT INTO dim_route_parameter
SELECT parameter_type, parameter, description, CAST(value AS DOUBLE), remark, current_timestamp()
FROM VALUES
  ('Fleet',   'num_vehicles',           'Vehicles available per dispatch',      3,     'trucks'),
  ('Fleet',   'vehicle_cash_capacity',  'Max cash carried per vehicle',         30000000, 'THB'),
  ('Fleet',   'crew_per_vehicle',       'Crew members per vehicle',             2,     'people'),
  ('Fleet',   'max_stops_per_route',    'Maximum stops on one route',           12,    'stops'),
  ('Fleet',   'max_route_hours',        'Maximum route duration',               9,     'hours'),
  ('Travel',  'avg_speed_kmh',          'Average travel speed',                 62,    'km/h'),
  ('Travel',  'road_factor',            'Road distance vs straight line',       1.32,  'multiplier'),
  ('Travel',  'city_service_minutes',   'Dwell time at a city branch',          25,    'minutes'),
  ('Travel',  'district_service_min',   'Dwell time at a district branch',      35,    'minutes'),
  ('Travel',  'machine_service_min',    'Dwell time at an ATM or RCM',          18,    'minutes'),
  ('Travel',  'depot_load_minutes',     'Loading time at the cash center',      40,    'minutes'),
  ('Cost',    'cost_per_km',            'Transport cost per kilometre',         65,    'THB/km'),
  ('Cost',    'co2_per_km',             'CO2 emitted per kilometre',            0.27,  'kg/km'),
  ('Cost',    'fuel_price',             'Diesel price per litre',               32.5,  'THB/litre'),
  ('Cost',    'fuel_consumption',       'Fuel used per kilometre',              0.18,  'litre/km'),
  ('Cost',    'normal_wage_hour',       'Crew wage, normal hours',              210,   'THB/hour'),
  ('Cost',    'ot_wage_hour',           'Crew wage, overtime',                  315,   'THB/hour'),
  ('Cost',    'ot_threshold_hours',     'Hours before overtime applies',        8,     'hours'),
  ('Policy',  'replenish_target_pct',   'Refill branches to this % of vault',   0.60,  'ratio'),
  ('Policy',  'excess_trigger_pct',     'Pickup when cash exceeds this %',      0.80,  'ratio'),
  ('Policy',  'keep_after_pickup_pct',  'Cash left behind after a pickup',      0.50,  'ratio'),
  ('Policy',  'min_threshold_pct',      'Minimum operating cash % of vault',    0.15,  'ratio'),
  ('Policy',  'idle_cash_residual_pct', 'Idle cash tolerated after planning',   0.22,  'ratio'),
  ('Policy',  'cost_of_fund_annual',    'Annual cost of idle funds',            0.0325,'ratio')
AS t(parameter_type, parameter, description, value, remark);

-- ══ Branch facts ══════════════════════════════════════════════════════════
-- Cash position: opening balance varies deterministically per branch-date,
-- and predicted closing = opening + deposits - withdrawals.

TRUNCATE TABLE fact_cash_position;
INSERT INTO fact_cash_position
SELECT
  business_date,
  branch_code,
  CAST(opening AS DECIMAL(18,2)),
  CAST(predicted AS DECIMAL(18,2)),
  CAST(deposit AS DECIMAL(18,2)),
  CAST(withdrawal AS DECIMAL(18,2)),
  CASE
    WHEN predicted < min_threshold THEN 'DELIVERY'
    WHEN predicted > cap * 0.80    THEN 'PICKUP'
    ELSE 'NO_ACTION'
  END,
  CASE
    WHEN predicted / cap < 0.05 OR predicted / cap > 0.95 THEN 'CRITICAL'
    WHEN predicted / cap < 0.15 OR predicted / cap > 0.85 THEN 'ACTION_NEEDED'
    WHEN predicted / cap < 0.30 OR predicted / cap > 0.70 THEN 'WATCH'
    ELSE 'HEALTHY'
  END,
  predicted < min_threshold * 0.5,
  CAST(CASE WHEN predicted < min_threshold THEN cap * 0.60 - predicted ELSE 0 END AS DECIMAL(18,2)),
  current_timestamp()
FROM (
  SELECT
    d.business_date,
    b.branch_code,
    b.cash_capacity_thb AS cap,
    b.cash_capacity_thb * 0.15 AS min_threshold,
    opening,
    deposit,
    withdrawal,
    opening + deposit - withdrawal AS predicted
  FROM v_date d
  CROSS JOIN v_branch b
  LATERAL VIEW OUTER inline(array(struct(
    -- Bucket each branch-date into a scenario so the planning day has a real
    -- mix of work: ~30% need a refill, ~25% are over the pickup line.
    b.cash_capacity_thb * CASE
      WHEN pmod(hash('bk', b.branch_code, d.business_date), 100) < 30
        THEN 0.02 + pmod(hash('op', b.branch_code, d.business_date), 10) / 100.0
      WHEN pmod(hash('bk', b.branch_code, d.business_date), 100) < 55
        THEN 0.82 + pmod(hash('op', b.branch_code, d.business_date), 14) / 100.0
      ELSE 0.32 + pmod(hash('op', b.branch_code, d.business_date), 36) / 100.0
    END AS opening,
    200000 + pmod(hash('dep', b.branch_code, d.business_date), 1300) * 1000 AS deposit,
    200000 + pmod(hash('wdr', b.branch_code, d.business_date), 1300) * 1000 AS withdrawal
  ))) v AS opening, deposit, withdrawal
);

-- Cash flow: a trailing 14-day window per business_date. Days before the
-- business date are ACTUAL, the business date itself is FORECAST.

TRUNCATE TABLE fact_cash_flow_daily;
INSERT INTO fact_cash_flow_daily
SELECT
  business_date,
  branch_code,
  series_date,
  CASE WHEN series_date < business_date THEN 'ACTUAL' ELSE 'FORECAST' END,
  CAST(deposit AS DECIMAL(18,2)),
  CAST(withdrawal AS DECIMAL(18,2)),
  CAST(deposit - withdrawal AS DECIMAL(18,2)),
  CAST(remaining AS DECIMAL(18,2)),
  current_timestamp()
FROM (
  SELECT
    d.business_date,
    b.branch_code,
    s.series_date,
    500000 + pmod(hash('fd', b.branch_code, s.series_date), 3500) * 1000 AS deposit,
    500000 + pmod(hash('fw', b.branch_code, s.series_date), 3500) * 1000 AS withdrawal,
    b.cash_capacity_thb * (0.12 + pmod(hash(b.branch_code, s.series_date), 78) / 100.0) AS remaining
  FROM v_date d
  CROSS JOIN v_branch b
  LATERAL VIEW explode(sequence(date_sub(d.business_date, 13), d.business_date, interval 1 day)) s AS series_date
);

-- Denominations: mix percentages sum to 100 per branch-date.

TRUNCATE TABLE fact_branch_denomination;
INSERT INTO fact_branch_denomination
SELECT
  business_date,
  branch_code,
  denomination_thb,
  CAST(actual_notes + delivery_notes AS INT),
  CAST((actual_notes + delivery_notes) * denomination_thb AS DECIMAL(18,2)),
  mix_pct,
  CAST(actual_notes AS INT),
  CAST(actual_notes * denomination_thb AS DECIMAL(18,2)),
  mix_pct,
  CAST(delivery_notes AS INT),
  CAST(delivery_notes * denomination_thb AS DECIMAL(18,2)),
  current_timestamp()
FROM (
  SELECT
    p.business_date,
    p.branch_code,
    dn.denomination_thb,
    dn.mix_pct,
    floor(p.actual_cash_d_minus_1 * dn.mix_pct / 100.0 / dn.denomination_thb) AS actual_notes,
    floor(p.delivery_amount_thb * dn.mix_pct / 100.0 / dn.denomination_thb) AS delivery_notes
  FROM fact_cash_position p
  CROSS JOIN (
    SELECT * FROM VALUES (1000, 55.0), (500, 25.0), (100, 15.0), (50, 5.0)
    AS t(denomination_thb, mix_pct)
  ) dn
);

-- ══ Machine facts ═════════════════════════════════════════════════════════

TRUNCATE TABLE fact_machine_position;
INSERT INTO fact_machine_position
SELECT
  business_date,
  machine_id,
  CAST(opening AS DECIMAL(18,2)),
  CAST(predicted AS DECIMAL(18,2)),
  CAST(deposit AS DECIMAL(18,2)),
  CAST(withdrawal AS DECIMAL(18,2)),
  CASE
    WHEN predicted > cap * 0.85 THEN 'Swap (Near Full)'
    WHEN predicted < cap * 0.20 THEN 'Swap (Near Empty)'
    ELSE 'No Action'
  END,
  CASE
    WHEN predicted / cap < 0.05 OR predicted / cap > 0.95 THEN 'CRITICAL'
    WHEN predicted / cap < 0.15 OR predicted / cap > 0.85 THEN 'ACTION_NEEDED'
    WHEN predicted / cap < 0.30 OR predicted / cap > 0.70 THEN 'WATCH'
    ELSE 'HEALTHY'
  END,
  predicted < cap * 0.10,
  CAST(CASE WHEN predicted < cap * 0.20 THEN cap * 0.70 - predicted ELSE 0 END AS DECIMAL(18,2)),
  CAST(CASE WHEN predicted > cap * 0.85 THEN predicted - cap * 0.50 ELSE 0 END AS DECIMAL(18,2)),
  current_timestamp()
FROM (
  SELECT
    d.business_date,
    m.machine_id,
    m.alltime_max_cash_thb AS cap,
    opening,
    deposit,
    withdrawal,
    opening + deposit - withdrawal AS predicted
  FROM v_date d
  CROSS JOIN v_machine m
  LATERAL VIEW OUTER inline(array(struct(
    -- Same bucketing as branches: ~25% near empty, ~25% near full.
    m.alltime_max_cash_thb * CASE
      WHEN pmod(hash('mbk', m.machine_id, d.business_date), 100) < 25
        THEN 0.04 + pmod(hash('mop', m.machine_id, d.business_date), 10) / 100.0
      WHEN pmod(hash('mbk', m.machine_id, d.business_date), 100) < 50
        THEN 0.86 + pmod(hash('mop', m.machine_id, d.business_date), 10) / 100.0
      ELSE 0.34 + pmod(hash('mop', m.machine_id, d.business_date), 34) / 100.0
    END AS opening,
    20000 + pmod(hash('md', m.machine_id, d.business_date), 130) * 1000 AS deposit,
    20000 + pmod(hash('mw', m.machine_id, d.business_date), 130) * 1000 AS withdrawal
  ))) v AS opening, deposit, withdrawal
);

TRUNCATE TABLE fact_machine_flow_daily;
INSERT INTO fact_machine_flow_daily
SELECT
  business_date,
  machine_id,
  series_date,
  CASE WHEN series_date < business_date THEN 'ACTUAL' ELSE 'FORECAST' END,
  CAST(deposit AS DECIMAL(18,2)),
  CAST(withdrawal AS DECIMAL(18,2)),
  CAST(deposit - withdrawal AS DECIMAL(18,2)),
  current_timestamp()
FROM (
  SELECT
    d.business_date,
    m.machine_id,
    s.series_date,
    50000 + pmod(hash('mfd', m.machine_id, s.series_date), 400) * 1000 AS deposit,
    50000 + pmod(hash('mfw', m.machine_id, s.series_date), 400) * 1000 AS withdrawal
  FROM v_date d
  CROSS JOIN v_machine m
  LATERAL VIEW explode(sequence(date_sub(d.business_date, 13), d.business_date, interval 1 day)) s AS series_date
);

TRUNCATE TABLE fact_machine_denomination;
INSERT INTO fact_machine_denomination
SELECT
  business_date,
  machine_id,
  denomination_thb,
  CAST(max_notes AS INT),
  CAST(actual_notes AS INT),
  CAST(actual_notes * denomination_thb AS DECIMAL(18,2)),
  CAST(remaining_notes AS INT),
  CAST(remaining_notes * denomination_thb AS DECIMAL(18,2)),
  CAST(add_notes AS INT),
  CAST(add_notes * denomination_thb AS DECIMAL(18,2)),
  CAST(remove_notes AS INT),
  CAST(remove_notes * denomination_thb AS DECIMAL(18,2)),
  current_timestamp()
FROM (
  SELECT
    p.business_date,
    p.machine_id,
    dn.denomination_thb,
    floor(m.alltime_max_cash_thb * dn.mix_pct / 100.0 / dn.denomination_thb) AS max_notes,
    floor(p.actual_cash_d_minus_1 * dn.mix_pct / 100.0 / dn.denomination_thb) AS actual_notes,
    floor(p.predicted_cash_d * dn.mix_pct / 100.0 / dn.denomination_thb) AS remaining_notes,
    floor(p.delivery_amount_thb * dn.mix_pct / 100.0 / dn.denomination_thb) AS add_notes,
    floor(p.remove_amount_thb * dn.mix_pct / 100.0 / dn.denomination_thb) AS remove_notes
  FROM fact_machine_position p
  JOIN v_machine m ON m.machine_id = p.machine_id
  CROSS JOIN (
    SELECT * FROM VALUES (1000, 60.0), (500, 28.0), (100, 12.0)
    AS t(denomination_thb, mix_pct)
  ) dn
);

-- ══ Route facts ═══════════════════════════════════════════════════════════
-- Branches needing action are assigned to a truck by hash, ordered into a
-- stop sequence, and given per-leg distances that accumulate monotonically.

CREATE OR REPLACE TEMPORARY VIEW v_stop_assign AS
SELECT
  p.business_date,
  concat('CC2-0', CAST(1 + pmod(hash(p.branch_code), 3) AS STRING)) AS truck_id,
  p.branch_code,
  b.branch_name,
  b.latitude,
  b.longitude,
  p.action_type,
  p.delivery_amount_thb,
  CASE WHEN p.action_type = 'PICKUP' THEN p.predicted_cash_d * 0.5 ELSE 0 END AS pickup_amount_thb,
  8 + pmod(hash(p.branch_code, p.business_date), 26) AS leg_km,
  row_number() OVER (
    PARTITION BY p.business_date, concat('CC2-0', CAST(1 + pmod(hash(p.branch_code), 3) AS STRING))
    ORDER BY p.branch_code
  ) AS stop_seq
FROM fact_cash_position p
JOIN v_branch b ON b.branch_code = p.branch_code
WHERE p.action_type <> 'NO_ACTION';

CREATE OR REPLACE TEMPORARY VIEW v_route_stop_all AS
SELECT business_date, truck_id, 0 AS stop_sequence, 'KCIM_CC2' AS stop_code,
       'KTB Khon Kaen Cash Center' AS stop_name, 'Depot' AS stop_type, 'START' AS action_type,
       16.4419 AS latitude, 102.8360 AS longitude, 0 AS leg_km,
       CAST(0 AS DECIMAL(18,2)) AS delivery_amount_thb, CAST(0 AS DECIMAL(18,2)) AS pickup_amount_thb
FROM (SELECT DISTINCT business_date, truck_id FROM v_stop_assign)
UNION ALL
SELECT business_date, truck_id, stop_seq, branch_code, branch_name, 'Branch',
       CASE WHEN action_type = 'DELIVERY' THEN 'DELIVERY' ELSE 'PICKUP' END,
       latitude, longitude, leg_km,
       CAST(delivery_amount_thb AS DECIMAL(18,2)), CAST(pickup_amount_thb AS DECIMAL(18,2))
FROM v_stop_assign
UNION ALL
SELECT business_date, truck_id, max_seq + 1, 'KCIM_CC2',
       'KTB Khon Kaen Cash Center', 'Depot', 'RETURN',
       16.4419, 102.8360, 18,
       CAST(0 AS DECIMAL(18,2)), CAST(0 AS DECIMAL(18,2))
FROM (SELECT business_date, truck_id, max(stop_seq) AS max_seq FROM v_stop_assign GROUP BY business_date, truck_id);

TRUNCATE TABLE fact_route_stop;
INSERT INTO fact_route_stop
SELECT
  business_date,
  truck_id,
  'OPTIMIZED',
  stop_sequence,
  stop_code,
  stop_name,
  stop_type,
  action_type,
  CASE WHEN action_type = 'START' THEN 'COMPLETED' ELSE 'PENDING' END,
  date_format(timestamp(concat('2000-01-01 ', '08:00:00')) + make_interval(0, 0, 0, 0, 0, CAST(cum_km * 1.4 AS INT), 0), 'HH:mm:ss'),
  date_format(timestamp(concat('2000-01-01 ', '08:00:00')) + make_interval(0, 0, 0, 0, 0, CAST(cum_km * 1.4 AS INT) + 20, 0), 'HH:mm:ss'),
  delivery_amount_thb,
  pickup_amount_thb,
  latitude,
  longitude,
  CAST(leg_km AS DOUBLE),
  CAST(cum_km AS DOUBLE),
  current_timestamp()
FROM (
  SELECT *, sum(leg_km) OVER (PARTITION BY business_date, truck_id ORDER BY stop_sequence) AS cum_km
  FROM v_route_stop_all
);

TRUNCATE TABLE fact_route_summary;
INSERT INTO fact_route_summary
SELECT
  business_date,
  truck_id,
  'OPTIMIZED',
  1,
  'KCIM_CC2',
  'KTB Khon Kaen Cash Center',
  16.4419,
  102.8360,
  CASE pmod(hash('st', truck_id, business_date), 10)
    WHEN 0 THEN 'DELAYED' WHEN 1 THEN 'AT_RISK' ELSE 'ON_TRACK' END,
  stops,
  0,
  stops,
  total_km,
  CAST(total_km * 1.4 + stops * 25 AS INT),
  '08:00:00',
  date_format(timestamp('2000-01-01 08:00:00') + make_interval(0, 0, 0, 0, 0, CAST(total_km * 1.4 + stops * 25 AS INT), 0), 'HH:mm:ss'),
  CAST(cap AS DECIMAL(18,2)),
  round(delivered / cap * 100, 1),
  CAST(delivered AS DECIMAL(18,2)),
  CAST(delivered AS DECIMAL(18,2)),
  CAST(0 AS DECIMAL(18,2)),
  CAST(collected AS DECIMAL(18,2)),
  CAST(total_km * 65 AS DECIMAL(18,2)),
  CAST(total_km * 65 + delivered * 0.0000325 AS DECIMAL(18,2)),
  round(88 + pmod(hash('sla', truck_id, business_date), 12), 1),
  least(8.0, total_km * 1.4 / 60 + stops * 0.42),
  greatest(0.0, total_km * 1.4 / 60 + stops * 0.42 - 8.0),
  CAST(total_km * 0.18 * 32.5 AS DECIMAL(18,2)),
  CAST(total_km * 4.2 AS DECIMAL(18,2)),
  CAST(total_km * 2.8 AS DECIMAL(18,2)),
  CAST(least(8.0, total_km * 1.4 / 60 + stops * 0.42) * 210 * 2 AS DECIMAL(18,2)),
  CAST(greatest(0.0, total_km * 1.4 / 60 + stops * 0.42 - 8.0) * 315 * 2 AS DECIMAL(18,2)),
  0,
  current_timestamp()
FROM (
  SELECT
    s.business_date,
    s.truck_id,
    count(*) - 2 AS stops,
    sum(s.leg_km) AS total_km,
    sum(s.delivery_amount_thb) AS delivered,
    sum(s.pickup_amount_thb) AS collected,
    max(t.cash_capacity_thb) AS cap
  FROM fact_route_stop s
  JOIN v_truck t ON t.truck_id = s.truck_id
  GROUP BY s.business_date, s.truck_id
);
