"""Python port of the mock ML forecast + CVRP-TW route mimic.

Mirrors frontend/src/data/mockData.ts so /api/plan returns the same shape the
React app builds client-side. Replace `build_branches` with the real inflow/
outflow model and `_order_route` with an OR-Tools CVRP-TW solve to go live.
"""
from __future__ import annotations

import math
from typing import Dict, List

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

ROAD_FACTOR = 1.32
AVG_SPEED_KMH = 62
COST_PER_KM_THB = 65
CO2_PER_KM_KG = 0.27
CREW_PER_VEHICLE = 2


def _rng(seed: int):
    state = {"s": seed & 0xFFFFFFFF}

    def nxt() -> float:
        state["s"] = (state["s"] + 0x6D2B79F5) & 0xFFFFFFFF
        t = state["s"]
        t = (t ^ (t >> 15)) * (1 | t) & 0xFFFFFFFF
        t = (t + ((t ^ (t >> 7)) * (61 | t) & 0xFFFFFFFF)) & 0xFFFFFFFF ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return nxt


def _haversine(a, b) -> float:
    R = 6371
    d_lat = math.radians(b["lat"] - a["lat"])
    d_lng = math.radians(b["lng"] - a["lng"])
    h = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(a["lat"])) * math.cos(
        math.radians(b["lat"])
    ) * math.sin(d_lng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def _road_km(a, b) -> float:
    return _haversine(a, b) * ROAD_FACTOR


def _drive_min(km: float) -> float:
    return km / AVG_SPEED_KMH * 60


def _clock(mins: float) -> str:
    m = round(mins)
    return f"{m // 60:02d}:{m % 60:02d}"


def _money(n: float) -> int:
    return round(n / 1000) * 1000


SCENARIO = {
    "0211": "PICKUP", "0663": "PICKUP", "0451": "REPLENISH", "0512": "PICKUP",
    "0338": "OK", "0277": "REPLENISH", "0421": "REPLENISH", "0389": "PICKUP",
    "0402": "REPLENISH", "0455": "OK", "0498": "PICKUP", "0533": "REPLENISH",
    "0547": "OK", "0561": "PICKUP",
}


def build_branches() -> List[Dict]:
    rnd = _rng(20260708)
    out = []
    for r in RAW_BRANCHES:
        if r.get("isDepot"):
            out.append({**r, "predictedInflow": 0, "predictedOutflow": 0, "openingCash": 0,
                        "cashCapacity": 0, "minThreshold": 0, "netFlow": 0, "projectedClosingCash": 0,
                        "status": "OK", "demand": 0, "serviceMinutes": 0,
                        "windowStart": "08:00", "windowEnd": "17:00", "id": r["code"]})
            continue
        is_city = r["district"] == "Mueang Khon Kaen"
        cap = _money((22 if is_city else 12) * 1_000_000 + rnd() * 6_000_000)
        min_thr = _money(cap * 0.15)
        status = SCENARIO.get(r["code"], "OK")

        if status == "REPLENISH":
            opening = _money(cap * (0.24 + rnd() * 0.06))
            closing = _money(cap * (0.05 + rnd() * 0.07))
            inflow = _money(cap * (0.14 + rnd() * 0.08))
            outflow = _money(inflow + (opening - closing))
            demand = _money(cap * 0.6 - closing)
        elif status == "PICKUP":
            opening = _money(cap * (0.5 + rnd() * 0.08))
            closing = _money(cap * (0.85 + rnd() * 0.08))
            outflow = _money(cap * (0.1 + rnd() * 0.07))
            inflow = _money(outflow + (closing - opening))
            demand = -_money(closing - cap * 0.5)
        else:
            opening = _money(cap * (0.45 + rnd() * 0.1))
            closing = _money(cap * (0.4 + rnd() * 0.2))
            drift = closing - opening
            inflow = _money(cap * (0.12 + rnd() * 0.06) + max(0, drift))
            outflow = _money(inflow - drift)
            demand = 0

        net = inflow - outflow
        out.append({
            "id": r["code"], "code": r["code"], "name": r["name"], "district": r["district"],
            "lat": r["lat"], "lng": r["lng"], "predictedInflow": inflow, "predictedOutflow": outflow,
            "openingCash": opening, "cashCapacity": cap, "minThreshold": min_thr, "netFlow": net,
            "projectedClosingCash": closing, "status": status, "demand": demand,
            "serviceMinutes": 0 if status == "OK" else (25 if is_city else 35),
            "windowStart": "09:00" if is_city else "09:30",
            "windowEnd": "16:00" if is_city else "15:30",
        })
    return out


def _route_len(depot, seq) -> float:
    total, prev = 0.0, depot
    for s in seq:
        total += _road_km(prev, s)
        prev = s
    return total + _road_km(prev, depot)


def _order_route(depot, stops):
    if len(stops) <= 1:
        return list(stops)
    remaining = list(stops)
    ordered, current = [], depot
    while remaining:
        best_i = min(range(len(remaining)), key=lambda i: _road_km(current, remaining[i]))
        current = remaining.pop(best_i)
        ordered.append(current)
    # light 2-opt
    best, improved, guard = ordered, True, 0
    while improved and guard < 40:
        improved, guard = False, guard + 1
        for i in range(len(best) - 1):
            for k in range(i + 1, len(best)):
                cand = best[:i] + best[i:k + 1][::-1] + best[k + 1:]
                if _route_len(depot, cand) + 1e-6 < _route_len(depot, best):
                    best, improved = cand, True
    return best


def _vehicle_route(depot, ordered, vid, label, color, start_min):
    stops, path = [], [[depot["lat"], depot["lng"]]]
    prev, cum, clock = depot, 0.0, start_min
    delivered = picked = svc = 0
    for i, b in enumerate(ordered):
        leg = _road_km(prev, b)
        cum += leg
        clock += _drive_min(leg)
        stops.append({"branchId": b["id"], "seq": i + 1, "arrival": _clock(clock),
                      "legDistanceKm": round(leg, 1), "cumulativeKm": round(cum, 1)})
        clock += b["serviceMinutes"]
        svc += b["serviceMinutes"]
        if b["demand"] > 0:
            delivered += b["demand"]
        else:
            picked += -b["demand"]
        path.append([b["lat"], b["lng"]])
        prev = b
    cum += _road_km(prev, depot)
    path.append([depot["lat"], depot["lng"]])
    return {"vehicleId": vid, "label": label, "color": color, "stops": stops, "path": path,
            "totalDistanceKm": round(cum, 1), "driveMinutes": round(_drive_min(cum)),
            "serviceMinutes": svc, "cashDelivered": delivered, "cashPickedUp": picked}


def _summarize(kind, vehicles):
    dist = sum(v["totalDistanceKm"] for v in vehicles)
    drive = sum(v["driveMinutes"] for v in vehicles)
    svc = sum(v["serviceMinutes"] for v in vehicles)
    served = sum(len(v["stops"]) for v in vehicles)
    man_hours = (drive + svc) / 60 * CREW_PER_VEHICLE
    return {"kind": kind, "vehicles": vehicles, "totalDistanceKm": round(dist, 1),
            "totalDriveMinutes": drive, "totalServiceMinutes": svc,
            "totalManHours": round(man_hours, 1), "vehiclesUsed": len(vehicles),
            "branchesServed": served}


def build_plan() -> Dict:
    branches = build_branches()
    depot = next(b for b in branches if b.get("isDepot"))
    actionable = [b for b in branches if not b.get("isDepot") and b["status"] != "OK"]

    sw = [b for b in actionable if b["lng"] < 102.7 or b["lat"] < 16.2]
    north = [b for b in actionable if not (b["lng"] < 102.7 or b["lat"] < 16.2)]

    va = _vehicle_route(depot, _order_route(depot, north), "VAN-01", "Van 01 · City + North", "#16a34a", 9 * 60)
    vb = _vehicle_route(depot, _order_route(depot, sw), "VAN-02", "Van 02 · South + West", "#0ea5e9", 9 * 60)
    optimized = _summarize("OPTIMIZED", [v for v in (va, vb) if v["stops"]])

    orig_order = sorted(actionable, key=lambda b: b["code"])
    v_orig = _vehicle_route(depot, orig_order, "VAN-OLD", "Current Manual Route", "#ef4444", int(8.5 * 60))
    original = _summarize("ORIGINAL", [v_orig])

    metrics = _metrics(branches, optimized, original)
    return {"planDate": "2026-07-08", "region": "Khon Kaen Province", "branches": branches,
            "optimized": optimized, "original": original, "metrics": metrics}


def _metrics(branches, optimized, original):
    dist_saved = round(original["totalDistanceKm"] - optimized["totalDistanceKm"], 1)
    mh_saved = round(original["totalManHours"] - optimized["totalManHours"], 1)
    total_excess = sum(abs(b["demand"]) for b in branches if b["status"] == "PICKUP")
    buffer_cash = sum(b["minThreshold"] * 0.5 for b in branches if b["status"] == "REPLENISH")
    idle_before = _money(total_excess + buffer_cash)
    idle_after = _money(idle_before * 0.22)
    return {
        "distanceSavedKm": dist_saved,
        "distanceSavedPct": round(dist_saved / original["totalDistanceKm"] * 100, 1),
        "manHoursSaved": mh_saved,
        "manHoursSavedPct": round(mh_saved / original["totalManHours"] * 100, 1),
        "vehiclesSaved": max(0, original["vehiclesUsed"] - optimized["vehiclesUsed"]),
        "fuelCostSavedThb": _money(dist_saved * COST_PER_KM_THB),
        "idleCashBeforeThb": idle_before,
        "idleCashAfterThb": idle_after,
        "idleCashReductionThb": idle_before - idle_after,
        "idleCashReductionPct": round((idle_before - idle_after) / idle_before * 100, 1),
        "co2SavedKg": round(dist_saved * CO2_PER_KM_KG),
        "onTimePct": 98.6,
        "branchesServed": optimized["branchesServed"],
        "branchesTotal": len([b for b in branches if not b.get("isDepot")]),
    }
