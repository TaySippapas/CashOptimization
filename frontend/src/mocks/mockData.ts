import type {
  AppConfig,
  Branch,
  BranchInput,
  CashStatus,
  ExecMetrics,
  OptimizerParams,
  PlanBundle,
  RoutePlan,
  RouteStop,
  VehicleRoute,
} from "@/types";
import { RAW_BRANCHES } from "./branches";
import {
  clusterBySweep,
  driveMinutes,
  makeRoadKm,
  minutesToClock,
  orderRoute,
  type DistFn,
} from "@/utils/geo";

// ---- Deterministic PRNG so default mock numbers are stable across reloads ----
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VAN_COLORS = ["#16a34a", "#0ea5e9", "#a855f7", "#f59e0b", "#ec4899", "#14b8a6"];

export const DEFAULT_PARAMS: OptimizerParams = {
  planDate: "2026-07-08",
  region: "Khon Kaen Province",
  numVans: 2,
  vanCashCapacity: 30_000_000,
  roadFactor: 1.32,
  avgSpeedKmh: 62,
  costPerKmThb: 65,
  co2PerKmKg: 0.27,
  crewPerVehicle: 2,
  replenishTargetPct: 0.6,
  excessLinePct: 0.8,
  keepPct: 0.5,
  cityServiceMin: 25,
  districtServiceMin: 35,
  idleCashResidualPct: 0.22,
};

function money(n: number): number {
  return Math.round(n / 1000) * 1000;
}

// Desired planning-day scenario per branch used ONLY to seed believable default
// inputs. Once loaded, status is re-derived dynamically from the numbers.
const SCENARIO: Record<string, CashStatus> = {
  "0211": "PICKUP",
  "0663": "PICKUP",
  "0451": "REPLENISH",
  "0512": "PICKUP",
  "0338": "OK",
  "0277": "REPLENISH",
  "0421": "REPLENISH",
  "0389": "PICKUP",
  "0402": "REPLENISH",
  "0455": "OK",
  "0498": "PICKUP",
  "0533": "REPLENISH",
  "0547": "OK",
  "0561": "PICKUP",
};

/** Build the default, editable branch inputs (seeded mock ML forecast). */
export function generateDefaultBranchInputs(): BranchInput[] {
  const rnd = mulberry32(20260708);
  return RAW_BRANCHES.map((r) => {
    if (r.isDepot) {
      return {
        code: r.code,
        name: r.name,
        district: r.district,
        lat: r.lat,
        lng: r.lng,
        isDepot: true,
        cashCapacity: 0,
        minThreshold: 0,
        openingCash: 0,
        predictedInflow: 0,
        predictedOutflow: 0,
      };
    }
    const isCity = r.district === "Mueang Khon Kaen";
    const capacity = money((isCity ? 22 : 12) * 1_000_000 + rnd() * 6_000_000);
    const minThreshold = money(capacity * 0.15);
    const status = SCENARIO[r.code] ?? "OK";

    let openingCash: number;
    let closing: number;
    let predictedInflow: number;
    let predictedOutflow: number;

    if (status === "REPLENISH") {
      openingCash = money(capacity * (0.24 + rnd() * 0.06));
      closing = money(capacity * (0.05 + rnd() * 0.07));
      predictedInflow = money(capacity * (0.14 + rnd() * 0.08));
      predictedOutflow = money(predictedInflow + (openingCash - closing));
    } else if (status === "PICKUP") {
      openingCash = money(capacity * (0.5 + rnd() * 0.08));
      closing = money(capacity * (0.85 + rnd() * 0.08));
      predictedOutflow = money(capacity * (0.1 + rnd() * 0.07));
      predictedInflow = money(predictedOutflow + (closing - openingCash));
    } else {
      openingCash = money(capacity * (0.45 + rnd() * 0.1));
      closing = money(capacity * (0.4 + rnd() * 0.2));
      const drift = closing - openingCash;
      predictedInflow = money(capacity * (0.12 + rnd() * 0.06) + Math.max(0, drift));
      predictedOutflow = money(predictedInflow - drift);
    }

    return {
      code: r.code,
      name: r.name,
      district: r.district,
      lat: r.lat,
      lng: r.lng,
      cashCapacity: capacity,
      minThreshold,
      openingCash,
      predictedInflow,
      predictedOutflow,
    };
  });
}

export const DEFAULT_CONFIG: AppConfig = {
  params: DEFAULT_PARAMS,
  branches: generateDefaultBranchInputs(),
};

/** Derive full branch state (status, demand, projected balance) from raw input. */
export function computeBranch(input: BranchInput, p: OptimizerParams): Branch {
  const isCity = input.district === "Mueang Khon Kaen";
  if (input.isDepot) {
    return {
      id: input.code,
      code: input.code,
      name: input.name,
      district: input.district,
      lat: input.lat,
      lng: input.lng,
      isDepot: true,
      predictedInflow: 0,
      predictedOutflow: 0,
      openingCash: 0,
      cashCapacity: 0,
      minThreshold: 0,
      netFlow: 0,
      projectedClosingCash: 0,
      status: "OK",
      demand: 0,
      serviceMinutes: 0,
      windowStart: input.windowStart ?? "08:00",
      windowEnd: input.windowEnd ?? "17:00",
    };
  }

  const netFlow = input.predictedInflow - input.predictedOutflow;
  const projectedClosingCash = Math.max(0, input.openingCash + netFlow);

  let status: CashStatus = "OK";
  let demand = 0;
  if (projectedClosingCash < input.minThreshold) {
    status = "REPLENISH";
    demand = money(input.cashCapacity * p.replenishTargetPct - projectedClosingCash);
  } else if (projectedClosingCash > input.cashCapacity * p.excessLinePct) {
    status = "PICKUP";
    demand = -money(projectedClosingCash - input.cashCapacity * p.keepPct);
  }

  const serviceMinutes =
    input.serviceMinutes ?? (status === "OK" ? 0 : isCity ? p.cityServiceMin : p.districtServiceMin);

  return {
    id: input.code,
    code: input.code,
    name: input.name,
    district: input.district,
    lat: input.lat,
    lng: input.lng,
    predictedInflow: input.predictedInflow,
    predictedOutflow: input.predictedOutflow,
    openingCash: input.openingCash,
    cashCapacity: input.cashCapacity,
    minThreshold: input.minThreshold,
    netFlow,
    projectedClosingCash,
    status,
    demand,
    serviceMinutes,
    windowStart: input.windowStart ?? (isCity ? "09:00" : "09:30"),
    windowEnd: input.windowEnd ?? (isCity ? "16:00" : "15:30"),
  };
}

function buildVehicleRoute(
  depot: Branch,
  ordered: Branch[],
  vehicleId: string,
  label: string,
  color: string,
  startClockMin: number,
  dist: DistFn,
  p: OptimizerParams
): VehicleRoute {
  const stops: RouteStop[] = [];
  const path: [number, number][] = [[depot.lat, depot.lng]];
  let prev: Branch = depot;
  let cum = 0;
  let clock = startClockMin;
  let cashDelivered = 0;
  let cashPickedUp = 0;
  let serviceMinutes = 0;

  ordered.forEach((b, i) => {
    const leg = dist(prev, b);
    cum += leg;
    clock += driveMinutes(leg, p.avgSpeedKmh);
    stops.push({
      branchId: b.id,
      seq: i + 1,
      arrival: minutesToClock(clock),
      legDistanceKm: Math.round(leg * 10) / 10,
      cumulativeKm: Math.round(cum * 10) / 10,
    });
    clock += b.serviceMinutes;
    serviceMinutes += b.serviceMinutes;
    if (b.demand > 0) cashDelivered += b.demand;
    else cashPickedUp += -b.demand;
    path.push([b.lat, b.lng]);
    prev = b;
  });

  cum += dist(prev, depot);
  path.push([depot.lat, depot.lng]);

  return {
    vehicleId,
    label,
    color,
    stops,
    path,
    totalDistanceKm: Math.round(cum * 10) / 10,
    driveMinutes: Math.round(driveMinutes(cum, p.avgSpeedKmh)),
    serviceMinutes,
    cashDelivered,
    cashPickedUp,
  };
}

function summarize(kind: RoutePlan["kind"], vehicles: VehicleRoute[], p: OptimizerParams): RoutePlan {
  const totalDistanceKm = vehicles.reduce((s, v) => s + v.totalDistanceKm, 0);
  const totalDriveMinutes = vehicles.reduce((s, v) => s + v.driveMinutes, 0);
  const totalServiceMinutes = vehicles.reduce((s, v) => s + v.serviceMinutes, 0);
  const branchesServed = vehicles.reduce((s, v) => s + v.stops.length, 0);
  const totalManHours = ((totalDriveMinutes + totalServiceMinutes) / 60) * p.crewPerVehicle;
  return {
    kind,
    vehicles,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    totalDriveMinutes,
    totalServiceMinutes,
    totalManHours: Math.round(totalManHours * 10) / 10,
    vehiclesUsed: vehicles.length,
    branchesServed,
  };
}

function regionLabel(stops: Branch[]): string {
  if (stops.length === 0) return "";
  const avgLng = stops.reduce((s, b) => s + b.lng, 0) / stops.length;
  const avgLat = stops.reduce((s, b) => s + b.lat, 0) / stops.length;
  const ns = avgLat >= 16.44 ? "North" : "South";
  const ew = avgLng >= 102.75 ? "East" : "West";
  return `${ns}-${ew}`;
}

export function buildPlanFromConfig(config: AppConfig): PlanBundle {
  const p = config.params;
  const dist = makeRoadKm(p.roadFactor);
  const branches = config.branches.map((b) => computeBranch(b, p));
  const depot = branches.find((b) => b.isDepot) ?? branches[0];
  const actionable = branches.filter((b) => !b.isDepot && b.status !== "OK");

  // ---- OPTIMIZED: OR-Tools CVRP-TW style — N vans, sweep clusters ----
  const clusters = clusterBySweep(depot, actionable, p.numVans);
  const optimizedVehicles = clusters.map((stops, i) =>
    buildVehicleRoute(
      depot,
      orderRoute(depot, stops, dist),
      `VAN-${String(i + 1).padStart(2, "0")}`,
      `Van ${String(i + 1).padStart(2, "0")} · ${regionLabel(stops)}`,
      VAN_COLORS[i % VAN_COLORS.length],
      9 * 60,
      dist,
      p
    )
  );
  const optimized = summarize("OPTIMIZED", optimizedVehicles, p);

  // ---- ORIGINAL: current manual plan — single van, fixed by code order ----
  const originalOrder = [...actionable].sort((a, b) => a.code.localeCompare(b.code));
  const vOrig = buildVehicleRoute(
    depot,
    originalOrder,
    "VAN-OLD",
    "Current Manual Route",
    "#ef4444",
    8.5 * 60,
    dist,
    p
  );
  const original = summarize("ORIGINAL", [vOrig], p);

  const metrics = buildMetrics(branches, optimized, original, p);

  return {
    planDate: p.planDate,
    region: p.region,
    branches,
    optimized,
    original,
    metrics,
  };
}

/** Backwards-compatible default plan. */
export function buildPlan(): PlanBundle {
  return buildPlanFromConfig(DEFAULT_CONFIG);
}

function buildMetrics(
  branches: Branch[],
  optimized: RoutePlan,
  original: RoutePlan,
  p: OptimizerParams
): ExecMetrics {
  const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b);
  const distanceSavedKm = Math.round((original.totalDistanceKm - optimized.totalDistanceKm) * 10) / 10;
  const distanceSavedPct = Math.round(safeDiv(distanceSavedKm, original.totalDistanceKm) * 1000) / 10;
  const manHoursSaved = Math.round((original.totalManHours - optimized.totalManHours) * 10) / 10;
  const manHoursSavedPct = Math.round(safeDiv(manHoursSaved, original.totalManHours) * 1000) / 10;
  const vehiclesSaved = Math.max(0, original.vehiclesUsed - optimized.vehiclesUsed);
  const fuelCostSavedThb = money(distanceSavedKm * p.costPerKmThb);
  const co2SavedKg = Math.round(distanceSavedKm * p.co2PerKmKg);

  const totalExcess = branches
    .filter((b) => b.status === "PICKUP")
    .reduce((s, b) => s + Math.abs(b.demand), 0);
  const bufferCash = branches
    .filter((b) => b.status === "REPLENISH")
    .reduce((s, b) => s + b.minThreshold * 0.5, 0);

  const idleCashBeforeThb = money(totalExcess + bufferCash);
  const idleCashAfterThb = money(idleCashBeforeThb * p.idleCashResidualPct);
  const idleCashReductionThb = idleCashBeforeThb - idleCashAfterThb;
  const idleCashReductionPct = Math.round(safeDiv(idleCashReductionThb, idleCashBeforeThb) * 1000) / 10;

  return {
    distanceSavedKm,
    distanceSavedPct,
    manHoursSaved,
    manHoursSavedPct,
    vehiclesSaved,
    fuelCostSavedThb,
    idleCashBeforeThb,
    idleCashAfterThb,
    idleCashReductionThb,
    idleCashReductionPct,
    co2SavedKg,
    onTimePct: 98.6,
    branchesServed: optimized.branchesServed,
    branchesTotal: branches.filter((b) => !b.isDepot).length,
  };
}
