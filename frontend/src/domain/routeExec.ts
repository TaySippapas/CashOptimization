import type {
  Branch,
  OptimizerParams,
  PlanBundle,
  RouteExecution,
  RouteStatus,
  RouteStopExec,
  StopStatus,
  StopType,
} from "@/types";
import { driveMinutes, makeRoadKm, minutesToClock } from "@/utils/geo";
import { COLOR } from "@/utils/colors";

const PALETTE = [COLOR.green, COLOR.accent, COLOR.purple, COLOR.amber, COLOR.red, "#14b8a6"];

export const ROUTE_STATUS_COLOR: Record<RouteStatus, string> = {
  "On Track": COLOR.green,
  Delayed: COLOR.amber,
  "At Risk": COLOR.red,
};

export const STOP_STATUS_COLOR: Record<StopStatus, string> = {
  Completed: COLOR.green,
  "In Progress": COLOR.accent,
  Pending: COLOR.slate,
};

export const STOP_TYPE_COLOR: Record<StopType, string> = {
  Deliver: COLOR.amber,
  Pickup: COLOR.sky,
  Mixed: COLOR.purple,
  Start: COLOR.green,
  Return: COLOR.green,
};

/** Demo "current time" used to simulate live progress along the routes. */
export const NOW_MIN = 13 * 60 + 20; // 13:20

function clockToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function money(n: number): number {
  return Math.round(n / 1000) * 1000;
}

/**
 * Convert an optimized plan into per-truck route executions.
 * This is the exact shape a customer's OR-Tools CVRP-TW output would take,
 * enriched with live tracking state (status / ETA / progress).
 */
export function buildRouteExecutions(plan: PlanBundle, params: OptimizerParams): RouteExecution[] {
  const byId = new Map<string, Branch>(plan.branches.map((b) => [b.id, b]));
  const depot = plan.branches.find((b) => b.isDepot) ?? plan.branches[0];

  return plan.optimized.vehicles.map((v, i) => {
    const routeId = `Route ${String(i + 1).padStart(2, "0")}`;
    const truckId = `TRK-${String(i + 1).padStart(2, "0")}`;

    const startMin = v.stops.length ? clockToMin(v.stops[0].arrival) - driveMinutes(v.stops[0].legDistanceKm, params.avgSpeedKmh) : 9 * 60;

    const stops: RouteStopExec[] = [];
    stops.push({
      seq: 0,
      code: "DEPOT",
      location: depot.name,
      type: "Start",
      status: "Completed",
      eta: minutesToClock(Math.max(startMin, 0)),
      lat: depot.lat,
      lng: depot.lng,
      amount: 0,
    });

    // Which service stop is currently being handled?
    const arrivals = v.stops.map((s) => clockToMin(s.arrival));
    const inProgressIdx = arrivals.findIndex((a) => a >= NOW_MIN);

    let lastCompletedCum = 0;
    v.stops.forEach((s, idx) => {
      const b = byId.get(s.branchId)!;
      const type: StopType = b.demand > 0 ? "Deliver" : "Pickup";
      let status: StopStatus;
      if (inProgressIdx === -1) status = "Completed";
      else if (idx < inProgressIdx) status = "Completed";
      else if (idx === inProgressIdx) status = "In Progress";
      else status = "Pending";
      if (status === "Completed") lastCompletedCum = s.cumulativeKm;
      stops.push({
        seq: s.seq,
        code: b.code,
        location: b.name,
        type,
        status,
        eta: s.arrival,
        lat: b.lat,
        lng: b.lng,
        amount: b.demand,
      });
    });

    // Return leg back to depot.
    const lastStop = v.stops[v.stops.length - 1];
    const lastBranch = lastStop ? byId.get(lastStop.branchId) : undefined;
    const returnLegKm = Math.max(0, v.totalDistanceKm - (lastStop?.cumulativeKm ?? 0));
    const returnMin =
      (lastStop ? clockToMin(lastStop.arrival) + (lastBranch?.serviceMinutes ?? 0) : startMin) +
      driveMinutes(returnLegKm, params.avgSpeedKmh);
    stops.push({
      seq: v.stops.length + 1,
      code: "DEPOT",
      location: depot.name,
      type: "Return",
      status: inProgressIdx === -1 ? "Completed" : "Pending",
      eta: minutesToClock(returnMin),
      lat: depot.lat,
      lng: depot.lng,
      amount: 0,
    });

    const completed = v.stops.filter((_, idx) => inProgressIdx === -1 || idx < inProgressIdx).length;
    const remaining = v.stops.length - completed;
    const distanceLeftKm = Math.round((v.totalDistanceKm - lastCompletedCum) * 10) / 10;

    const deliveryAmount = money(v.cashDelivered);
    const pickupAmount = money(v.cashPickedUp);
    const cashOnBoard = money(deliveryAmount + pickupAmount);
    // Armored vans carry more than the reference planning capacity; floor so
    // utilization stays realistic (never over 100%).
    const vehicleCapacity = Math.max(params.vanCashCapacity, Math.ceil((cashOnBoard * 1.6) / 1_000_000) * 1_000_000);

    // Deterministic live status: mostly on track, occasional delay/risk.
    const status: RouteStatus =
      remaining > 0 && i % 3 === 1 ? "Delayed" : remaining > 0 && i % 7 === 5 ? "At Risk" : "On Track";

    return {
      routeId,
      truckId,
      label: v.label,
      status,
      depot: depot.name,
      depotLat: depot.lat,
      depotLng: depot.lng,
      totalStops: v.stops.length,
      completed,
      remaining,
      distanceKm: v.totalDistanceKm,
      distanceLeftKm,
      etaReturn: minutesToClock(returnMin),
      vehicleCapacity,
      cashOnBoard,
      pickupAmount,
      deliveryAmount,
      color: v.color,
      path: v.path,
      stops,
    };
  });
}

export interface RouteTrackSummary {
  totalRoutes: number;
  totalStops: number;
  totalDistanceKm: number;
  slaPct: number | null;
  utilizationPct: number;
  costOfTransport: number;
  onTrack: number;
  delayed: number;
  atRisk: number;
}

/**
 * Aggregate route KPIs purely from RouteExecution[] (UC data).
 * No dependency on plan or params — all values come from backend.
 */
export function summarizeRoutes(execs: RouteExecution[]): RouteTrackSummary {
  const totalStops = execs.reduce((s, e) => s + e.totalStops, 0);
  const totalDistanceKm = Math.round(execs.reduce((s, e) => s + e.distanceKm, 0) * 10) / 10;
  const utilizationPct = execs.length
    ? Math.round(execs.reduce((s, e) => s + (e.utilizationPct ?? 0), 0) / execs.length * 10) / 10
    : 0;
  const costOfTransport = Math.round(execs.reduce((s, e) => s + (e.costOfTransport ?? 0), 0) * 100) / 100;
  // slaPct: use average from backend if available, otherwise null
  const slaValues = execs.filter((e) => e.slaPct != null && e.slaPct! > 0).map((e) => e.slaPct!);
  const slaPct = slaValues.length
    ? Math.round(slaValues.reduce((a, b) => a + b, 0) / slaValues.length * 10) / 10
    : null;
  return {
    totalRoutes: execs.length,
    totalStops,
    totalDistanceKm,
    slaPct,
    utilizationPct,
    costOfTransport,
    onTrack: execs.filter((e) => e.status === "On Track").length,
    delayed: execs.filter((e) => e.status === "Delayed").length,
    atRisk: execs.filter((e) => e.status === "At Risk").length,
  };
}

/**
 * Parse a customer-supplied route plan (the JSON input format) back into
 * fully-derived route executions. Live tracking fields (status/ETA progress,
 * distances, cash) are recomputed. Throws on invalid input.
 */
export function parseRouteInput(json: string, params: OptimizerParams): RouteExecution[] {
  const doc = JSON.parse(json);
  const routes = doc?.routes;
  if (!Array.isArray(routes) || routes.length === 0) throw new Error("No `routes` array found.");
  const dist = makeRoadKm(params.roadFactor);

  return routes.map((r: any, ri: number) => {
    if (!Array.isArray(r.stops) || r.stops.length === 0) throw new Error(`Route ${ri + 1} has no stops.`);
    const rawStops = r.stops as any[];
    const start = rawStops.find((s) => s.type === "Start") ?? rawStops[0];
    const depotLat = Number(start.lat);
    const depotLng = Number(start.lng);
    const depotName = r.depot ?? start.location ?? "Depot";

    const service = rawStops.filter((s) => s.type !== "Start" && s.type !== "Return");
    const arrivals = service.map((s) => clockToMin(String(s.eta)));
    const inProgressIdx = arrivals.findIndex((a) => a >= NOW_MIN);

    // Ordered coordinates for distance + path (depot -> stops -> depot).
    const coords: [number, number][] = [
      [depotLat, depotLng],
      ...service.map((s) => [Number(s.lat), Number(s.lng)] as [number, number]),
      [depotLat, depotLng],
    ];
    let total = 0;
    const cum: number[] = [];
    for (let i = 1; i < coords.length; i++) {
      total += dist({ lat: coords[i - 1][0], lng: coords[i - 1][1] }, { lat: coords[i][0], lng: coords[i][1] });
      cum.push(Math.round(total * 10) / 10);
    }
    const distanceKm = Math.round(total * 10) / 10;

    let lastCompletedCum = 0;
    const stops: RouteStopExec[] = [];
    stops.push({ seq: 0, code: "DEPOT", location: depotName, type: "Start", status: "Completed", eta: String(start.eta ?? "09:00"), lat: depotLat, lng: depotLng, amount: 0 });
    service.forEach((s, idx) => {
      let status: StopStatus;
      if (inProgressIdx === -1 || idx < inProgressIdx) status = "Completed";
      else if (idx === inProgressIdx) status = "In Progress";
      else status = "Pending";
      if (status === "Completed") lastCompletedCum = cum[idx];
      stops.push({
        seq: idx + 1,
        code: String(s.code ?? ""),
        location: String(s.location ?? ""),
        type: (s.type as StopType) ?? (Number(s.amount) >= 0 ? "Deliver" : "Pickup"),
        status,
        eta: String(s.eta ?? ""),
        lat: Number(s.lat),
        lng: Number(s.lng),
        amount: Number(s.amount ?? 0),
      });
    });
    const returnRaw = rawStops.find((s) => s.type === "Return");
    const etaReturn = String(returnRaw?.eta ?? service[service.length - 1]?.eta ?? "17:00");
    stops.push({ seq: service.length + 1, code: "DEPOT", location: depotName, type: "Return", status: inProgressIdx === -1 ? "Completed" : "Pending", eta: etaReturn, lat: depotLat, lng: depotLng, amount: 0 });

    const deliveryAmount = money(service.filter((s) => Number(s.amount) > 0).reduce((a, s) => a + Number(s.amount), 0));
    const pickupAmount = money(service.filter((s) => Number(s.amount) < 0).reduce((a, s) => a + -Number(s.amount), 0));
    const cashOnBoard = money(deliveryAmount + pickupAmount);
    const vehicleCapacity = Math.max(
      Number(r.vehicleCashCapacity) || 0,
      Math.ceil((cashOnBoard * 1.6) / 1_000_000) * 1_000_000
    );
    const completed = inProgressIdx === -1 ? service.length : inProgressIdx;

    return {
      routeId: r.routeId ?? `Route ${String(ri + 1).padStart(2, "0")}`,
      truckId: r.truckId ?? `TRK-${String(ri + 1).padStart(2, "0")}`,
      label: r.zone ?? r.label ?? `Route ${ri + 1}`,
      status: completed < service.length && ri % 3 === 1 ? "Delayed" : "On Track",
      depot: depotName,
      depotLat,
      depotLng,
      totalStops: service.length,
      completed,
      remaining: service.length - completed,
      distanceKm,
      distanceLeftKm: Math.round((distanceKm - lastCompletedCum) * 10) / 10,
      etaReturn,
      vehicleCapacity,
      cashOnBoard,
      pickupAmount,
      deliveryAmount,
      color: PALETTE[ri % PALETTE.length],
      path: coords,
      stops,
    };
  });
}

/** The route input format, as JSON — what the customer feeds in from OR-Tools. */
export function routeInputJson(execs: RouteExecution[]): string {
  const doc = {
    schemaVersion: "1.0",
    unit: { cash: "THB", distance: "km", time: "HH:MM (24h)" },
    routes: execs.map((e) => ({
      routeId: e.routeId,
      truckId: e.truckId,
      zone: e.label,
      depot: e.depot,
      vehicleCashCapacity: e.vehicleCapacity,
      stops: e.stops.map((s) => ({
        seq: s.seq,
        code: s.code,
        location: s.location,
        type: s.type, // Start | Deliver | Pickup | Mixed | Return
        eta: s.eta,
        amount: s.amount, // +deliver / -pickup / 0 depot
        lat: s.lat,
        lng: s.lng,
      })),
    })),
  };
  return JSON.stringify(doc, null, 2);
}
