# Legacy flat-table pipeline; see scripts/README.md before running.
#!/usr/bin/env python3
"""Create and seed Unity Catalog mock tables for the KTB cash optimization app.

Usage (from repo root, with nan-demo profile):
  DATABRICKS_CONFIG_PROFILE=nan-demo python scripts/legacy/seed_uc_mock_tables.py
"""
from __future__ import annotations

import math
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("DATABRICKS_CONFIG_PROFILE", "nan-demo")

from server.settings import get_settings  # noqa: E402
from server.sql_client import bulk_insert, execute_many, query_dicts  # noqa: E402

def _business_date() -> date:
    raw = (os.getenv("APP_BUSINESS_DATE") or os.getenv("BUSINESS_DATE") or "").strip()
    if raw and raw.lower() not in {"auto", "latest", "*"}:
        return date.fromisoformat(raw[:10])
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo("Asia/Bangkok")).date()
    except Exception:
        return date.today()


BUSINESS_DATE = _business_date()
REGION = "KK"
REGION_NAME = "Khon Kaen"
NOW = datetime.now(timezone.utc).replace(tzinfo=None)

RAW_BRANCHES = [
    {"code": "CC-KKN", "name": "KTB Khon Kaen Cash Center", "district": "Mueang Khon Kaen", "lat": 16.4419, "lng": 102.836, "isDepot": True},
    {"code": "0211", "name": "Khon Kaen Branch", "district": "Mueang Khon Kaen", "lat": 16.4322, "lng": 102.8236},
    {"code": "0663", "name": "Central Plaza Khon Kaen", "district": "Mueang Khon Kaen", "lat": 16.4515, "lng": 102.814},
    {"code": "0451", "name": "Khon Kaen University", "district": "Mueang Khon Kaen", "lat": 16.4749, "lng": 102.8226},
    {"code": "0512", "name": "Big C Khon Kaen", "district": "Mueang Khon Kaen", "lat": 16.4198, "lng": 102.8489},
    {"code": "0338", "name": "Pratumuang Branch", "district": "Mueang Khon Kaen", "lat": 16.4291, "lng": 102.8305},
    {"code": "0277", "name": "Ban Phai Branch", "district": "Ban Phai", "lat": 16.06, "lng": 102.735},
    {"code": "0421", "name": "Chum Phae Branch", "district": "Chum Phae", "lat": 16.543, "lng": 102.1},
    {"code": "0389", "name": "Nam Phong Branch", "district": "Nam Phong", "lat": 16.705, "lng": 102.862},
    {"code": "0402", "name": "Nong Rua Branch", "district": "Nong Rua", "lat": 16.499, "lng": 102.442},
    {"code": "0455", "name": "Mancha Khiri Branch", "district": "Mancha Khiri", "lat": 16.2, "lng": 102.533},
    {"code": "0498", "name": "Kranuan Branch", "district": "Kranuan", "lat": 16.71, "lng": 103.09},
    {"code": "0533", "name": "Phu Wiang Branch", "district": "Phu Wiang", "lat": 16.66, "lng": 102.36},
    {"code": "0547", "name": "Ubol Ratana Branch", "district": "Ubol Ratana", "lat": 16.77, "lng": 102.62},
    {"code": "0561", "name": "Nong Song Hong Branch", "district": "Nong Song Hong", "lat": 15.83, "lng": 102.77},
]

SCENARIO = {
    "0211": "PICKUP", "0663": "PICKUP", "0451": "DELIVERY", "0512": "PICKUP",
    "0338": "NO_ACTION", "0277": "DELIVERY", "0421": "DELIVERY", "0389": "PICKUP",
    "0402": "DELIVERY", "0455": "NO_ACTION", "0498": "PICKUP", "0533": "DELIVERY",
    "0547": "NO_ACTION", "0561": "PICKUP",
}

MACHINE_VENUES = [
    {"name": "Central Plaza Khon Kaen", "lat": 16.4515, "lng": 102.814, "district": "Mueang Khon Kaen", "n": 6},
    {"name": "Fairy Plaza", "lat": 16.4361, "lng": 102.8306, "district": "Mueang Khon Kaen", "n": 4},
    {"name": "Big C Khon Kaen", "lat": 16.4198, "lng": 102.8489, "district": "Mueang Khon Kaen", "n": 4},
    {"name": "Lotus's Khon Kaen", "lat": 16.4585, "lng": 102.8352, "district": "Mueang Khon Kaen", "n": 4},
    {"name": "Khon Kaen University", "lat": 16.4749, "lng": 102.8226, "district": "Mueang Khon Kaen", "n": 6},
    {"name": "Srinagarind Hospital", "lat": 16.4667, "lng": 102.8261, "district": "Mueang Khon Kaen", "n": 3},
    {"name": "Khon Kaen Hospital", "lat": 16.4322, "lng": 102.8395, "district": "Mueang Khon Kaen", "n": 3},
    {"name": "KK Bus Terminal 3", "lat": 16.4457, "lng": 102.8098, "district": "Mueang Khon Kaen", "n": 2},
    {"name": "KK Railway Station", "lat": 16.4386, "lng": 102.8296, "district": "Mueang Khon Kaen", "n": 2},
    {"name": "Ban Phai Market", "lat": 16.06, "lng": 102.735, "district": "Ban Phai", "n": 3},
    {"name": "Chum Phae Plaza", "lat": 16.543, "lng": 102.1, "district": "Chum Phae", "n": 3},
    {"name": "Nam Phong Market", "lat": 16.705, "lng": 102.862, "district": "Nam Phong", "n": 2},
    {"name": "Nong Rua Fresh Market", "lat": 16.499, "lng": 102.442, "district": "Nong Rua", "n": 2},
    {"name": "Kranuan Town", "lat": 16.71, "lng": 103.09, "district": "Kranuan", "n": 2},
    {"name": "Phu Wiang Market", "lat": 16.66, "lng": 102.36, "district": "Phu Wiang", "n": 2},
]

COLORS = ["#22c55e", "#38bdf8", "#a855f7", "#f59e0b"]
MACHINE_CAP = 1_000_000
# Databricks Apps service principal (client id from `databricks apps get`)
APP_SP = "d2c55a9b-d3f3-490b-9d17-7444a06b9498"


def rng(seed: int):
    state = {"s": seed & 0xFFFFFFFF}

    def nxt() -> float:
        state["s"] = (state["s"] + 0x6D2B79F5) & 0xFFFFFFFF
        t = state["s"]
        t = (t ^ (t >> 15)) * (1 | t) & 0xFFFFFFFF
        t = (t + ((t ^ (t >> 7)) * (61 | t) & 0xFFFFFFFF)) & 0xFFFFFFFF ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return nxt


def money(n: float) -> int:
    return round(n / 1000) * 1000


def haversine(a, b) -> float:
    R = 6371
    d_lat = math.radians(b["lat"] - a["lat"])
    d_lng = math.radians(b["lng"] - a["lng"])
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(a["lat"])) * math.cos(math.radians(b["lat"])) * math.sin(d_lng / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(h)) * 1.32


def classify_machine(eod: float, cap: float):
    pct = eod / cap if cap else 0
    if pct < 0.12:
        return "DELIVERY", "CRITICAL", "VERY_HIGH", True
    if pct < 0.25:
        return "DELIVERY", "ACTION_NEEDED", "HIGH", False
    if pct > 0.90:
        return "PICKUP", "ACTION_NEEDED", "HIGH", pct > 0.95
    if pct > 0.80:
        return "PICKUP", "WATCH", "MEDIUM", False
    if pct < 0.40 or pct > 0.70:
        return "NO_ACTION", "WATCH", "MEDIUM", False
    return "NO_ACTION", "HEALTHY", "LOW", False


def ddl(fq: str) -> list[str]:
    return [
        f"CREATE SCHEMA IF NOT EXISTS {fq}",
        f"""
        CREATE OR REPLACE TABLE {fq}.app_settings (
          business_date DATE, region_code STRING, region_name STRING, area_code STRING,
          available_trucks INT, default_truck_capacity_thb DECIMAL(18,2),
          average_speed_kmh DOUBLE, cost_per_km_thb DECIMAL(18,2), co2_per_km_kg DOUBLE,
          crew_per_vehicle INT, delivery_target_pct DOUBLE, pickup_trigger_pct DOUBLE,
          cash_keep_pct DOUBLE, city_service_minutes INT, district_service_minutes INT,
          max_route_duration_hours DOUBLE, updated_at TIMESTAMP
        )
        """,
        f"""
        CREATE OR REPLACE TABLE {fq}.machine_snapshot (
          business_date DATE, region_code STRING, area_code STRING,
          machine_id STRING, machine_type STRING, location_name STRING, district_name STRING,
          latitude DOUBLE, longitude DOUBLE,
          actual_cash_d_minus_1 DECIMAL(18,2), predicted_cash_d DECIMAL(18,2),
          cash_capacity_thb DECIMAL(18,2), deposit_amount_d DECIMAL(18,2),
          withdrawal_amount_d DECIMAL(18,2), prediction_confidence DOUBLE,
          action_type STRING, health_status STRING, risk_level STRING,
          emergency_flag BOOLEAN, model_id STRING, model_version STRING, updated_at TIMESTAMP
        )
        """,
        f"""
        CREATE OR REPLACE TABLE {fq}.machine_daily_flow (
          business_date DATE, region_code STRING, machine_id STRING, series_date DATE,
          value_type STRING, deposit_amount_thb DECIMAL(18,2),
          withdrawal_amount_thb DECIMAL(18,2), net_amount_thb DECIMAL(18,2),
          model_version STRING, updated_at TIMESTAMP
        )
        """,
        f"""
        CREATE OR REPLACE TABLE {fq}.machine_denomination (
          business_date DATE, region_code STRING, machine_id STRING,
          denomination_thb INT, predicted_note_count INT, predicted_amount_thb DECIMAL(18,2),
          predicted_mix_pct DOUBLE, updated_at TIMESTAMP
        )
        """,
        f"""
        CREATE OR REPLACE TABLE {fq}.branch_snapshot (
          business_date DATE, region_code STRING, area_code STRING,
          branch_code STRING, branch_name STRING, district_name STRING,
          latitude DOUBLE, longitude DOUBLE, is_depot BOOLEAN,
          actual_cash_d_minus_1 DECIMAL(18,2), predicted_deposit_d DECIMAL(18,2),
          predicted_withdrawal_d DECIMAL(18,2), predicted_cash_d DECIMAL(18,2),
          cash_capacity_thb DECIMAL(18,2), minimum_threshold_thb DECIMAL(18,2),
          delivery_amount_thb DECIMAL(18,2), pickup_amount_thb DECIMAL(18,2),
          action_type STRING, health_status STRING, emergency_flag BOOLEAN,
          prediction_confidence DOUBLE, service_minutes INT,
          window_start STRING, window_end STRING,
          model_id STRING, model_version STRING, updated_at TIMESTAMP
        )
        """,
        f"""
        CREATE OR REPLACE TABLE {fq}.branch_daily_flow (
          business_date DATE, region_code STRING, branch_code STRING, series_date DATE,
          value_type STRING, deposit_amount_thb DECIMAL(18,2),
          withdrawal_amount_thb DECIMAL(18,2), net_amount_thb DECIMAL(18,2),
          model_version STRING, updated_at TIMESTAMP
        )
        """,
        f"""
        CREATE OR REPLACE TABLE {fq}.branch_denomination_gap (
          business_date DATE, region_code STRING, branch_code STRING,
          denomination_thb INT, surplus_shortfall_thb DECIMAL(18,2), updated_at TIMESTAMP
        )
        """,
        f"""
        CREATE OR REPLACE TABLE {fq}.route_summary (
          business_date DATE, region_code STRING, route_id STRING, route_plan_type STRING,
          route_label STRING, truck_id STRING, route_status STRING,
          depot_code STRING, depot_name STRING, depot_latitude DOUBLE, depot_longitude DOUBLE,
          total_stops INT, completed_stops INT, remaining_stops INT,
          total_distance_km DOUBLE, distance_left_km DOUBLE, total_duration_minutes INT,
          eta_return STRING, vehicle_capacity_thb DECIMAL(18,2), cash_on_board_thb DECIMAL(18,2),
          pickup_amount_thb DECIMAL(18,2), delivery_amount_thb DECIMAL(18,2),
          vehicle_utilization_pct DOUBLE, sla_achievement_pct DOUBLE, cit_cost_thb DECIMAL(18,2),
          route_color_hex STRING, updated_at TIMESTAMP
        )
        """,
        f"""
        CREATE OR REPLACE TABLE {fq}.route_stops (
          business_date DATE, region_code STRING, route_id STRING, route_plan_type STRING,
          truck_id STRING, stop_sequence INT, stop_code STRING, stop_name STRING,
          stop_type STRING, stop_status STRING, eta STRING, amount_thb DECIMAL(18,2),
          latitude DOUBLE, longitude DOUBLE, leg_km DOUBLE, cumulative_km DOUBLE,
          updated_at TIMESTAMP
        )
        """,
        f"GRANT USE SCHEMA ON SCHEMA {fq} TO `{APP_SP}`",
        f"GRANT SELECT ON SCHEMA {fq} TO `{APP_SP}`",
    ]


def gen_machines():
    rnd = rng(770077)
    machines = []
    counter = 1000
    for v in MACHINE_VENUES:
        for k in range(v["n"]):
            counter += 7
            lat = v["lat"] + (rnd() - 0.5) * 0.012
            lng = v["lng"] + (rnd() - 0.5) * 0.012
            current = money(MACHINE_CAP * (0.1 + rnd() * 0.85))
            daily_net = money((rnd() - 0.5) * 900_000)
            eod = max(0, current + daily_net)
            action, health, risk, emergency = classify_machine(eod, MACHINE_CAP)
            deposit = money(abs(daily_net) * (0.4 + rnd() * 0.3)) if daily_net > 0 else money(80_000 + rnd() * 120_000)
            withdraw = money(abs(daily_net) * (0.4 + rnd() * 0.3)) if daily_net < 0 else money(80_000 + rnd() * 120_000)
            if daily_net >= 0:
                deposit = money(abs(daily_net) + withdraw * 0.3)
            else:
                withdraw = money(abs(daily_net) + deposit * 0.3)
            machines.append(
                {
                    "id": f"RCM-{counter}",
                    "location": f"{v['name']} #{k + 1}" if v["n"] > 1 else v["name"],
                    "district": v["district"],
                    "lat": lat,
                    "lng": lng,
                    "current": current,
                    "eod": eod,
                    "deposit": deposit,
                    "withdraw": withdraw,
                    "conf": round(88 + rnd() * 11, 1),
                    "action": action,
                    "health": health,
                    "risk": risk,
                    "emergency": emergency,
                    "seed": counter,
                }
            )
    return machines


def gen_flow_rows(entity_id: str, seed: int, base_dep: float, base_wd: float, is_machine: bool):
    rnd = rng(seed)
    rows = []
    for i in range(14):
        d = BUSINESS_DATE - timedelta(days=13 - i)
        weekend = d.weekday() >= 5
        wf = 0.55 if weekend else 1.0
        dep = money(base_dep * wf * (0.75 + rnd() * 0.5))
        wd = money(base_wd * wf * (0.75 + rnd() * 0.5))
        value_type = "ACTUAL" if i < 13 else "PREDICTED"
        rows.append((entity_id, d, value_type, dep, wd, dep - wd))
    return rows


def gen_branches():
    rnd = rng(20260708)
    out = []
    for r in RAW_BRANCHES:
        if r.get("isDepot"):
            out.append(
                {
                    **r,
                    "opening": 0,
                    "inflow": 0,
                    "outflow": 0,
                    "closing": 0,
                    "cap": 0,
                    "min_thr": 0,
                    "action": "NO_ACTION",
                    "health": "HEALTHY",
                    "emergency": False,
                    "conf": 100.0,
                    "svc": 0,
                    "ws": "08:00",
                    "we": "17:00",
                    "delivery": 0,
                    "pickup": 0,
                }
            )
            continue
        is_city = r["district"] == "Mueang Khon Kaen"
        cap = money((22 if is_city else 12) * 1_000_000 + rnd() * 6_000_000)
        min_thr = money(cap * 0.15)
        status = SCENARIO.get(r["code"], "NO_ACTION")
        if status == "DELIVERY":
            opening = money(cap * (0.24 + rnd() * 0.06))
            closing = money(cap * (0.05 + rnd() * 0.07))
            inflow = money(cap * (0.14 + rnd() * 0.08))
            outflow = money(inflow + (opening - closing))
            delivery = money(cap * 0.6 - closing)
            pickup = 0
            health = "CRITICAL" if closing / cap < 0.1 else "ACTION_NEEDED"
            emergency = closing / cap < 0.08
        elif status == "PICKUP":
            opening = money(cap * (0.5 + rnd() * 0.08))
            closing = money(cap * (0.85 + rnd() * 0.08))
            outflow = money(cap * (0.1 + rnd() * 0.07))
            inflow = money(outflow + (closing - opening))
            pickup = money(closing - cap * 0.5)
            delivery = 0
            health = "ACTION_NEEDED" if closing / cap > 0.9 else "WATCH"
            emergency = closing / cap > 0.95
        else:
            opening = money(cap * (0.45 + rnd() * 0.1))
            closing = money(cap * (0.4 + rnd() * 0.2))
            drift = closing - opening
            inflow = money(cap * (0.12 + rnd() * 0.06) + max(0, drift))
            outflow = money(inflow - drift)
            delivery = pickup = 0
            health = "HEALTHY"
            emergency = False
        out.append(
            {
                **r,
                "opening": opening,
                "inflow": inflow,
                "outflow": outflow,
                "closing": closing,
                "cap": cap,
                "min_thr": min_thr,
                "action": status,
                "health": health,
                "emergency": emergency,
                "conf": round(90 + rnd() * 9, 1),
                "svc": 0 if status == "NO_ACTION" else (25 if is_city else 35),
                "ws": "09:00" if is_city else "09:30",
                "we": "16:00" if is_city else "15:30",
                "delivery": delivery,
                "pickup": pickup,
            }
        )
    return out


def build_routes(branches):
    depot = next(b for b in branches if b.get("isDepot"))
    actionable = [b for b in branches if not b.get("isDepot") and b["action"] != "NO_ACTION"]
    sw = [b for b in actionable if b["lng"] < 102.7 or b["lat"] < 16.2]
    north = [b for b in actionable if not (b["lng"] < 102.7 or b["lat"] < 16.2)]
    clusters = [("Route 01", "TRK-01", "City + North", north), ("Route 02", "TRK-02", "South + West", sw)]

    summaries = []
    stops = []

    def order(stops_list):
        remaining = list(stops_list)
        ordered, cur = [], depot
        while remaining:
            i = min(range(len(remaining)), key=lambda j: haversine(cur, remaining[j]))
            cur = remaining.pop(i)
            ordered.append(cur)
        return ordered

    for idx, (route_id, truck_id, label, cluster) in enumerate(clusters):
        if not cluster:
            continue
        ordered = order(cluster)
        for plan_type, status, color_shift in (("OPTIMIZED", "ON_TRACK", 0), ("ACTUAL", "DELAYED" if idx == 1 else "ON_TRACK", 0.002)):
            ordered_plan = ordered if plan_type == "OPTIMIZED" else list(reversed(ordered))
            path_stops = []
            path_stops.append(
                {
                    "seq": 0,
                    "code": "DEPOT",
                    "name": depot["name"],
                    "type": "START",
                    "status": "COMPLETED",
                    "eta": "08:45",
                    "amount": 0,
                    "lat": depot["lat"],
                    "lng": depot["lng"],
                    "leg": 0,
                    "cum": 0,
                }
            )
            prev = depot
            cum = 0.0
            clock = 9 * 60
            delivery = pickup = 0
            for i, b in enumerate(ordered_plan):
                leg = haversine(prev, b)
                cum += leg
                clock += int(leg / 62 * 60)
                stype = "DELIVERY" if b["action"] == "DELIVERY" else "PICKUP"
                amount = b["delivery"] if stype == "DELIVERY" else -b["pickup"]
                if stype == "DELIVERY":
                    delivery += b["delivery"]
                else:
                    pickup += b["pickup"]
                # Progress simulation @ 13:20
                if clock < 13 * 60 + 20:
                    sstatus = "COMPLETED"
                elif clock < 13 * 60 + 50:
                    sstatus = "IN_PROGRESS"
                else:
                    sstatus = "PENDING"
                path_stops.append(
                    {
                        "seq": i + 1,
                        "code": b["code"],
                        "name": b["name"],
                        "type": stype,
                        "status": sstatus,
                        "eta": f"{clock // 60:02d}:{clock % 60:02d}",
                        "amount": amount,
                        "lat": b["lat"] + (color_shift if plan_type == "ACTUAL" else 0),
                        "lng": b["lng"] + (color_shift if plan_type == "ACTUAL" else 0),
                        "leg": round(leg, 1),
                        "cum": round(cum, 1),
                    }
                )
                clock += b["svc"]
                prev = b
            ret_leg = haversine(prev, depot)
            cum += ret_leg
            clock += int(ret_leg / 62 * 60)
            path_stops.append(
                {
                    "seq": len(ordered_plan) + 1,
                    "code": "DEPOT",
                    "name": depot["name"],
                    "type": "RETURN",
                    "status": "PENDING",
                    "eta": f"{clock // 60:02d}:{clock % 60:02d}",
                    "amount": 0,
                    "lat": depot["lat"],
                    "lng": depot["lng"],
                    "leg": round(ret_leg, 1),
                    "cum": round(cum, 1),
                }
            )
            completed = sum(1 for s in path_stops if s["status"] == "COMPLETED" and s["type"] not in ("START", "RETURN"))
            total_stops = len(ordered_plan)
            remaining = total_stops - completed
            util = min(95, round((delivery + pickup) / 25_000_000 * 100, 1))
            summaries.append(
                {
                    "route_id": route_id,
                    "plan_type": plan_type,
                    "label": f"{label} ({plan_type.title()})",
                    "truck_id": truck_id,
                    "status": status,
                    "depot": depot,
                    "total_stops": total_stops,
                    "completed": completed,
                    "remaining": remaining,
                    "distance": round(cum * (1.08 if plan_type == "ACTUAL" else 1.0), 1),
                    "distance_left": round(cum * remaining / max(total_stops, 1), 1),
                    "duration": clock - 9 * 60,
                    "eta_return": path_stops[-1]["eta"],
                    "delivery": delivery,
                    "pickup": pickup,
                    "util": util,
                    "color": COLORS[idx],
                    "cit": money(cum * 65 + 2 * 1200),
                }
            )
            for s in path_stops:
                stops.append({**s, "route_id": route_id, "plan_type": plan_type, "truck_id": truck_id})
    return summaries, stops


def main():
    settings = get_settings()
    fq = settings.fq
    print(f"Seeding {fq} via warehouse {settings.warehouse_id} …")

    execute_many(ddl(fq))
    print("Schema + tables created; grants applied.")

    # app_settings
    bulk_insert(
        f"{fq}.app_settings",
        [
            (
                BUSINESS_DATE,
                REGION,
                REGION_NAME,
                "MUEANG",
                3,
                25_000_000,
                62.0,
                65.0,
                0.27,
                2,
                60.0,
                80.0,
                50.0,
                25,
                35,
                10.0,
                NOW,
            )
        ],
    )

    machines = gen_machines()
    machine_rows = []
    flow_rows = []
    denom_rows = []
    for m in machines:
        machine_rows.append(
            (
                BUSINESS_DATE,
                REGION,
                "MUEANG" if "Mueang" in m["district"] else "DISTRICT",
                m["id"],
                "RCM",
                m["location"],
                m["district"],
                m["lat"],
                m["lng"],
                m["current"],
                m["eod"],
                MACHINE_CAP,
                m["deposit"],
                m["withdraw"],
                m["conf"],
                m["action"],
                m["health"],
                m["risk"],
                m["emergency"],
                "machine-cash-forecast",
                "2026.07.1",
                NOW,
            )
        )
        for entity_id, d, vt, dep, wd, net in gen_flow_rows(m["id"], m["seed"], m["deposit"], m["withdraw"], True):
            flow_rows.append((BUSINESS_DATE, REGION, entity_id, d, vt, dep, wd, net, "2026.07.1", NOW))
        rnd = rng(m["seed"] + 99)
        mix = [40 + rnd() * 10, 25 + rnd() * 10, 15 + rnd() * 10, 5 + rnd() * 10]
        total = sum(mix)
        mix = [round(x / total * 100, 1) for x in mix]
        for den, pct in zip((1000, 500, 100, 50), mix):
            amt = money(m["eod"] * pct / 100)
            denom_rows.append((BUSINESS_DATE, REGION, m["id"], den, int(amt / den) if den else 0, amt, pct, NOW))

    bulk_insert(f"{fq}.machine_snapshot", machine_rows)
    bulk_insert(f"{fq}.machine_daily_flow", flow_rows)
    bulk_insert(f"{fq}.machine_denomination", denom_rows)
    print(f"Machines: {len(machine_rows)} snapshots, {len(flow_rows)} flow, {len(denom_rows)} denom")

    branches = gen_branches()
    branch_rows = []
    bflow_rows = []
    gap_rows = []
    for b in branches:
        branch_rows.append(
            (
                BUSINESS_DATE,
                REGION,
                "MUEANG" if "Mueang" in b["district"] else "DISTRICT",
                b["code"],
                b["name"],
                b["district"],
                b["lat"],
                b["lng"],
                bool(b.get("isDepot")),
                b["opening"],
                b["inflow"],
                b["outflow"],
                b["closing"],
                b["cap"],
                b["min_thr"],
                b["delivery"],
                b["pickup"],
                b["action"],
                b["health"],
                b["emergency"],
                b["conf"],
                b["svc"],
                b["ws"],
                b["we"],
                "branch-cash-forecast",
                "2026.07.1",
                NOW,
            )
        )
        if not b.get("isDepot"):
            for entity_id, d, vt, dep, wd, net in gen_flow_rows(
                b["code"], hash(b["code"]) & 0xFFFF, max(b["inflow"], 200_000), max(b["outflow"], 200_000), False
            ):
                bflow_rows.append((BUSINESS_DATE, REGION, entity_id, d, vt, dep, wd, net, "2026.07.1", NOW))
            rnd = rng(hash(b["code"]) & 0xFFFF)
            for den in (1000, 500, 100, 50):
                gap = money((rnd() - 0.5) * 800_000)
                gap_rows.append((BUSINESS_DATE, REGION, b["code"], den, gap, NOW))

    bulk_insert(f"{fq}.branch_snapshot", branch_rows)
    bulk_insert(f"{fq}.branch_daily_flow", bflow_rows)
    bulk_insert(f"{fq}.branch_denomination_gap", gap_rows)
    print(f"Branches: {len(branch_rows)} snapshots, {len(bflow_rows)} flow, {len(gap_rows)} gaps")

    summaries, stop_rows = build_routes(branches)
    summary_tuples = [
        (
            BUSINESS_DATE,
            REGION,
            r["route_id"],
            r["plan_type"],
            r["label"],
            r["truck_id"],
            r["status"],
            r["depot"]["code"],
            r["depot"]["name"],
            r["depot"]["lat"],
            r["depot"]["lng"],
            r["total_stops"],
            r["completed"],
            r["remaining"],
            r["distance"],
            r["distance_left"],
            r["duration"],
            r["eta_return"],
            25_000_000,
            r["delivery"] - r["pickup"],
            r["pickup"],
            r["delivery"],
            r["util"],
            98.6 if r["status"] == "ON_TRACK" else 91.2,
            r["cit"],
            r["color"],
            NOW,
        )
        for r in summaries
    ]
    stop_tuples = [
        (
            BUSINESS_DATE,
            REGION,
            s["route_id"],
            s["plan_type"],
            s["truck_id"],
            s["seq"],
            s["code"],
            s["name"],
            s["type"],
            s["status"],
            s["eta"],
            s["amount"],
            s["lat"],
            s["lng"],
            s["leg"],
            s["cum"],
            NOW,
        )
        for s in stop_rows
    ]
    bulk_insert(f"{fq}.route_summary", summary_tuples)
    bulk_insert(f"{fq}.route_stops", stop_tuples)
    print(f"Routes: {len(summary_tuples)} summaries, {len(stop_tuples)} stops")

    # Verify
    counts = query_dicts(
        f"""
        SELECT 'machine_snapshot' t, COUNT(*) c FROM {fq}.machine_snapshot
        UNION ALL SELECT 'branch_snapshot', COUNT(*) FROM {fq}.branch_snapshot
        UNION ALL SELECT 'route_summary', COUNT(*) FROM {fq}.route_summary
        UNION ALL SELECT 'route_stops', COUNT(*) FROM {fq}.route_stops
        """
    )
    for row in counts:
        print(f"  {row['t']}: {row['c']}")
    print("Done.")


if __name__ == "__main__":
    main()
