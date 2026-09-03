import type { AppConfig, ExecMetrics, Machine, PlanBundle, RiskLevel, RouteExecution } from "@/types";
import type { RouteTrackSummary } from "./routeExec";
import { generateBranchTracks, summarizeMachines } from "./tracking";

export interface ExecutiveMetrics {
  totalCashManaged: number;
  idleCash: number;
  citCostMtd: number;
  serviceNeededMachines: number;
  branchRisk: number;
  routeSla: number | null;
  vehicleUtilization: number;
  today: {
    plannedDeliveries: number;
    plannedPickups: number;
    plannedMixed: number;
    totalStops: number;
    totalDistanceKm: number;
    totalDurationH: number;
  };
  routeStatus: { onTrack: number; delayed: number; atRisk: number; total: number };
  utilization24h: { hour: string; pct: number }[];
  topCashOutRisk: {
    id: string;
    location: string;
    predictedCash: number;
    risk: RiskLevel;
    action: string;
  }[];
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genUtilization24h(basePct: number): { hour: string; pct: number }[] {
  const rnd = mulberry32(880088);
  const hours = ["06", "08", "10", "12", "14", "16", "18", "20", "22"];
  return hours.map((h) => {
    const wave = h <= "12" ? 0.12 : h <= "16" ? 0.08 : -0.06;
    const pct = Math.min(98, Math.max(42, basePct + wave * 100 + (rnd() - 0.5) * 14));
    return { hour: `${h}:00`, pct: Math.round(pct * 10) / 10 };
  });
}

export function buildExecutiveMetrics(
  config: AppConfig,
  plan: PlanBundle,
  metrics: ExecMetrics,
  execs: RouteExecution[],
  routeSummary: RouteTrackSummary,
  machines?: Machine[]
): ExecutiveMetrics {
  const machineList = machines ?? [];
  const machineSummary = summarizeMachines(machineList);
  const branchTracks = generateBranchTracks(config);

  const branchCash = plan.branches.reduce((s, b) => s + b.openingCash, 0);
  const machineCash = machineList.reduce((s, m) => s + m.currentCash, 0);
  const totalCashManaged = branchCash + machineCash;

  const branchRisk = branchTracks.filter(
    (b) => b.health === "Action Needed" || b.health === "Critical" || b.emergency
  ).length;

  const deliveries =
    machineList.filter((m) => m.action === "Deliver").length +
    branchTracks.filter((b) => b.action === "Deliver").length;
  const pickups =
    machineList.filter((m) => m.action === "Pickup").length +
    branchTracks.filter((b) => b.action === "Pickup").length;
  const mixed = branchTracks.filter((b) => b.action === "Both").length;

  // Cash-out risk = risk of a machine running EMPTY. Rank by the lowest
  // predicted end-of-day balance relative to capacity (a full machine is not
  // a cash-out risk), and derive a cash-out-specific tier + action so the row
  // is internally consistent (never "Very High cash-out" on a full machine).
  const cashOutTier = (ratio: number): RiskLevel =>
    ratio < 0.06 ? "Very High" : ratio < 0.12 ? "High" : ratio < 0.2 ? "Medium" : "Low";

  const topCashOutRisk = [...machineList]
    .map((m) => ({ m, ratio: m.predictedEod / (m.cashCapacity || 1) }))
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 10)
    .map(({ m, ratio }) => ({
      id: m.id,
      location: m.location,
      predictedCash: m.predictedEod,
      risk: cashOutTier(ratio),
      // Align with Machine Tracking action vocabulary.
      action:
        ratio < 0.06
          ? "Swap (Near Empty)"
          : ratio < 0.12
            ? "Swap (Near Empty)"
            : ratio > 0.9
              ? "Swap (Near Full)"
              : "No Action",
    }));

  return {
    totalCashManaged,
    idleCash: metrics.idleCashAfterThb,
    citCostMtd: (routeSummary.costOfTransport ?? 0) * 22,
    serviceNeededMachines: machineSummary.pickup + machineSummary.deliver,
    branchRisk,
    routeSla: routeSummary.slaPct ?? null,
    vehicleUtilization: routeSummary.utilizationPct,
    today: {
      plannedDeliveries: deliveries,
      plannedPickups: pickups,
      plannedMixed: mixed,
      totalStops: routeSummary.totalStops,
      totalDistanceKm: routeSummary.totalDistanceKm,
      totalDurationH: plan.optimized.totalManHours,
    },
    routeStatus: {
      onTrack: routeSummary.onTrack,
      delayed: routeSummary.delayed,
      atRisk: routeSummary.atRisk,
      total: routeSummary.totalRoutes,
    },
    utilization24h: genUtilization24h(routeSummary.utilizationPct),
    topCashOutRisk,
  };
}
