import type { AppConfig, PlanBundle } from "@/types";
import { buildPlanFromConfig } from "@/mocks/mockData";

export interface ScenarioAssumptions {
  demandChangePct: number; // % change in withdrawal demand
  cashInChangePct: number; // % change in deposit inflow
  availableTrucks: number;
  maxRouteDurationH: number;
  truckCapacityThb: number;
}

export interface ScenarioPreset {
  id: string;
  label: string;
  assumptions: Partial<ScenarioAssumptions>;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  { id: "demand10", label: "What-if (Demand +10%)", assumptions: { demandChangePct: 10, cashInChangePct: 5 } },
  { id: "payday", label: "Payday / Month-end surge", assumptions: { demandChangePct: 25, cashInChangePct: 12 } },
  { id: "holiday", label: "Long holiday (Songkran)", assumptions: { demandChangePct: 35, cashInChangePct: 8 } },
  { id: "lowseason", label: "Low season", assumptions: { demandChangePct: -12, cashInChangePct: -6 } },
  { id: "fleetcut", label: "Fleet reduction (−1 van)", assumptions: { demandChangePct: 0, cashInChangePct: 0 } },
  { id: "custom", label: "Custom", assumptions: {} },
];

export const DEFAULT_ASSUMPTIONS: ScenarioAssumptions = {
  demandChangePct: 10,
  cashInChangePct: 5,
  availableTrucks: 35,
  maxRouteDurationH: 10,
  truckCapacityThb: 50_000_000,
};

export interface SimResultRow {
  key: string;
  label: string;
  base: number;
  scenario: number;
  unit: "km" | "hrs" | "thb" | "count" | "pct";
  deltaPct: number; // signed % vs base
  higherIsWorse: boolean;
}

export interface ScenarioResult {
  base: PlanBundle;
  scenario: PlanBundle;
  scenarioConfig: AppConfig;
  rows: SimResultRow[];
  vehiclesRequired: number;
  slaScenario: number;
  longestRouteH: number;
  additionalTrucks: number;
  recommendedDurationH: number;
  feasible: boolean;
}

function applyScenario(config: AppConfig, a: ScenarioAssumptions, presetId: string): AppConfig {
  const demandK = 1 + a.demandChangePct / 100;
  const cashInK = 1 + a.cashInChangePct / 100;
  const numVans =
    presetId === "fleetcut" ? Math.max(1, config.params.numVans - 1) : config.params.numVans;
  return {
    params: {
      ...config.params,
      numVans,
      vanCashCapacity: a.truckCapacityThb,
    },
    branches: config.branches.map((b) =>
      b.isDepot
        ? b
        : {
            ...b,
            predictedOutflow: Math.round(b.predictedOutflow * demandK),
            predictedInflow: Math.round(b.predictedInflow * cashInK),
          }
    ),
  };
}

function costOf(plan: PlanBundle, config: AppConfig): number {
  return plan.optimized.totalDistanceKm * config.params.costPerKmThb;
}

export function runScenario(
  config: AppConfig,
  assumptions: ScenarioAssumptions,
  presetId: string
): ScenarioResult {
  const base = buildPlanFromConfig(config);
  const scenarioConfig = applyScenario(config, assumptions, presetId);
  const scenario = buildPlanFromConfig(scenarioConfig);

  const baseSla = base.metrics.onTimePct;

  // Longest single-route working time in the scenario (drive + service).
  const longestRouteMin = scenario.optimized.vehicles.reduce(
    (mx, v) => Math.max(mx, v.driveMinutes + v.serviceMinutes),
    0
  );
  const longestRouteH = Math.round((longestRouteMin / 60) * 10) / 10;

  // SLA erodes when a route exceeds the max shift duration.
  const overloadH = Math.max(0, longestRouteH - assumptions.maxRouteDurationH);
  const slaScenario = Math.max(80, Math.round((baseSla - overloadH * 6) * 10) / 10);

  const vehiclesRequired = scenario.optimized.vehiclesUsed;

  // Extra trucks to bring the longest route back under the shift cap.
  const additionalTrucks =
    overloadH > 0 ? Math.ceil((overloadH / assumptions.maxRouteDurationH) * vehiclesRequired) : 0;
  const recommendedDurationH = Math.max(assumptions.maxRouteDurationH, Math.ceil(longestRouteH * 2) / 2);
  const feasible = vehiclesRequired + additionalTrucks <= assumptions.availableTrucks;

  const baseCost = costOf(base, config);
  const scenarioCost = costOf(scenario, scenarioConfig);

  const pctDelta = (b: number, s: number) => (b === 0 ? 0 : Math.round(((s - b) / b) * 1000) / 10);

  const rows: SimResultRow[] = [
    {
      key: "distance",
      label: "Total Distance",
      base: base.optimized.totalDistanceKm,
      scenario: scenario.optimized.totalDistanceKm,
      unit: "km",
      deltaPct: pctDelta(base.optimized.totalDistanceKm, scenario.optimized.totalDistanceKm),
      higherIsWorse: true,
    },
    {
      key: "duration",
      label: "Total Duration",
      base: base.optimized.totalManHours,
      scenario: scenario.optimized.totalManHours,
      unit: "hrs",
      deltaPct: pctDelta(base.optimized.totalManHours, scenario.optimized.totalManHours),
      higherIsWorse: true,
    },
    {
      key: "cost",
      label: "Total Cost",
      base: baseCost,
      scenario: scenarioCost,
      unit: "thb",
      deltaPct: pctDelta(baseCost, scenarioCost),
      higherIsWorse: true,
    },
    {
      key: "stops",
      label: "Stops",
      base: base.optimized.branchesServed,
      scenario: scenario.optimized.branchesServed,
      unit: "count",
      deltaPct: pctDelta(base.optimized.branchesServed, scenario.optimized.branchesServed),
      higherIsWorse: false,
    },
    {
      key: "vehicles",
      label: "Vehicles Required",
      base: base.optimized.vehiclesUsed,
      scenario: vehiclesRequired,
      unit: "count",
      deltaPct: pctDelta(base.optimized.vehiclesUsed, vehiclesRequired),
      higherIsWorse: true,
    },
    {
      key: "sla",
      label: "SLA Achievement",
      base: baseSla,
      scenario: slaScenario,
      unit: "pct",
      deltaPct: Math.round((slaScenario - baseSla) * 10) / 10,
      higherIsWorse: false,
    },
  ];

  return {
    base,
    scenario,
    scenarioConfig,
    rows,
    vehiclesRequired,
    slaScenario,
    longestRouteH,
    additionalTrucks,
    recommendedDurationH,
    feasible,
  };
}
