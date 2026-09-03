# Databricks notebook: daily refresh for KTB Cash App UC tables + views
# Rolls the latest business_date slice to today (Asia/Bangkok) and rebuilds views.

# COMMAND ----------

from datetime import date, datetime
from zoneinfo import ZoneInfo

from pyspark.sql import functions as F

dbutils.widgets.text("catalog", "mdp_dev_dit")
dbutils.widgets.text("source_schema", "default")
dbutils.widgets.text("view_schema", "default")
dbutils.widgets.text("business_date", "")  # blank = today Asia/Bangkok
dbutils.widgets.text("app_service_principal", "d2c55a9b-d3f3-490b-9d17-7444a06b9498")

catalog = dbutils.widgets.get("catalog")
source_schema = dbutils.widgets.get("source_schema")
view_schema = dbutils.widgets.get("view_schema")
target_date_str = dbutils.widgets.get("business_date").strip()
app_sp = dbutils.widgets.get("app_service_principal").strip()

TABLES = [
    "app_settings",
    "machine_snapshot",
    "machine_daily_flow",
    "machine_denomination",
    "branch_snapshot",
    "branch_daily_flow",
    "branch_denomination_gap",
    "route_summary",
    "route_stops",
]

source = f"{catalog}.{source_schema}"
views = f"{catalog}.{view_schema}"
tz = ZoneInfo("Asia/Bangkok")
target_date = date.fromisoformat(target_date_str) if target_date_str else datetime.now(tz).date()

max_bd = spark.sql(f"SELECT MAX(business_date) AS bd FROM {source}.app_settings").collect()[0]["bd"]
if max_bd is None:
    raise RuntimeError(f"No rows in {source}.app_settings — seed mock tables first")
max_bd_date = max_bd if hasattr(max_bd, "isoformat") else date.fromisoformat(str(max_bd)[:10])
delta_days = (target_date - max_bd_date).days

print(f"Refreshing {source}: {max_bd_date} → {target_date} (delta={delta_days}d)")

# COMMAND ----------

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {source}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {views}")

for table in TABLES:
    fq = f"{source}.{table}"
    df = spark.table(fq)
    if "business_date" in df.columns:
        df = df.filter(F.col("business_date") == F.lit(max_bd_date))
        df = df.withColumn("business_date", F.lit(target_date))
    if "series_date" in df.columns and delta_days != 0:
        df = df.withColumn("series_date", F.date_add(F.col("series_date"), F.lit(delta_days)))
    if "updated_at" in df.columns:
        df = df.withColumn("updated_at", F.current_timestamp())
    (
        df.write.format("delta")
        .mode("overwrite")
        .option("overwriteSchema", "true")
        .saveAsTable(fq)
    )
    print(f"  {fq}: {spark.table(fq).count()} rows")

# COMMAND ----------

for table in TABLES:
    spark.sql(
        f"CREATE OR REPLACE VIEW {views}.{table} AS SELECT * FROM {source}.{table}"
    )
    print(f"  view {views}.{table}")

spark.sql(f"GRANT USE SCHEMA ON SCHEMA {views} TO `{app_sp}`")
spark.sql(f"GRANT SELECT ON SCHEMA {views} TO `{app_sp}`")
print("Daily UC refresh complete:", target_date.isoformat())
