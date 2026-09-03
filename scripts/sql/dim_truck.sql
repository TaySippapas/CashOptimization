-- dim_truck: fleet master data (1 row per truck_id, no date grain — it's a
-- master table, not a daily snapshot). Source: mock_data/app_truck_master.csv
-- Prereq: databricks fs cp mock_data/app_truck_master.csv dbfs:/Volumes/mdp_dev_dit/default/landing/app_truck_master.csv -p <profile>

USE CATALOG mdp_dev_dit;
USE SCHEMA default;

CREATE TABLE IF NOT EXISTS dim_truck (
  truck_id          STRING NOT NULL,
  plate_number      STRING,
  cash_capacity_thb DECIMAL(18,2),
  base_depot_id     STRING,
  status            STRING,   -- ACTIVE | MAINTENANCE | INACTIVE
  updated_at        TIMESTAMP
) USING DELTA;

TRUNCATE TABLE dim_truck;
INSERT INTO dim_truck
SELECT truck_id, plate_number, cash_capacity_thb, base_depot_id, status, updated_at
FROM read_files('/Volumes/mdp_dev_dit/default/landing/app_truck_master.csv', format => 'csv', header => true);
