import { MOCK_END, MOCK_DATES, mockDateRange, mockBranches, mockMachines, mockRoutes, mockBranchInputs, mockFleet, shiftDate } from "./snapshots";
import { mockDaily, mockTrends } from "./trends";
import type { TrackingDataset } from "@/api/backend";
import type { TrendPeriod } from "@/domain/trends";

const CONFIG_KEY = "cash-route-standalone-config-v1";
const defaultParams = [
  ["cost", "fuel_cost_per_km", 5, "Fuel (THB/km)"], ["cost", "repair_cost_per_km", 1.5, "Repair (THB/km)"],
  ["cost", "maintenance_cost_per_km", 2, "Maintenance (THB/km)"], ["cost", "normal_wage_per_hour", 250, "Normal wage (THB/hour)"],
  ["cost", "ot_wage_per_hour", 375, "Overtime wage (THB/hour)"], ["vehicle", "cash_capacity", 30000000, "Cash capacity (THB)"],
  ["vehicle", "average_speed_kmh", 62, "Average speed (km/h)"], ["time_window", "start_hour", 8.5, "Start hour"],
  ["time_window", "end_hour", 16.5, "End hour"], ["service_time", "branch_minutes", 25, "Branch service (minutes)"],
  ["service_time", "machine_minutes", 15, "Machine service (minutes)"], ["lunch_time", "duration_minutes", 60, "Lunch break (minutes)"],
].map(([parameterType, parameter, value, description]) => ({ parameterType: String(parameterType), parameter: String(parameter), value: Number(value), description: String(description), remark: "Demo setting", updatedAt: MOCK_END }));
type Config = { trucks: typeof mockFleet; params: typeof defaultParams };
function readConfig(): Config {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* Storage is unavailable in some preview environments. */ }
  return structuredClone({ trucks: mockFleet, params: defaultParams });
}

function mockOverview(end: string, period: string) {
  const days = ({ day: 1, week: 7, month: 30, quarter: 90, year: 365 } as Record<string, number>)[period];
  if (!days) throw new Error("Unknown period");
  const start = shiftDate(end, 1 - days);
  const dates = Array.from({ length: days }, (_, i) => shiftDate(start, i)).filter((d) => MOCK_DATES.includes(d));
  const b = dates.map((d) => mockDaily("branches", d)), m = dates.map((d) => mockDaily("machines", d)), r = dates.map((d) => mockDaily("routes", d));
  const sum = (rows: typeof b, key: string) => rows.reduce((total, row) => total + (row[key] ?? 0), 0);
  const avg = (rows: typeof b, key: string) => sum(rows, key) / Math.max(1, rows.length);
  const routes = dates.flatMap(mockRoutes);
  const branchCoverage = dates.map((d) => {
    const demand = new Set(mockBranches(d, false).filter((row) => row.action !== "No Action").map((row) => row.code));
    const planned = new Set(mockRoutes(d).flatMap((route) => route.stops.filter((s) => s.category === "Branch").map((s) => s.code)));
    const covered = [...demand].filter((id) => planned.has(id)).length;
    return { demand: demand.size, planned: planned.size, covered, unserved: demand.size - covered, extra: planned.size - covered };
  });
  const branch = Object.fromEntries(["demand", "planned", "covered", "unserved", "extra"].map((key) => [key, branchCoverage.reduce((total, row) => total + row[key as keyof typeof row], 0) / Math.max(1, dates.length)]));
  const cot = sum(r, "transportCost"), cof = sum(b, "costOfFund") + sum(m, "costOfFund");
  return { source: "mock", period, periodDays: dates.length, periodStart: start, periodEnd: end,
    demand: {
      branch: { total: avg(b, "entities"), needService: avg(b, "_service"), deliveryAmount: sum(b, "delivery"), totalActualCash: avg(b, "openingCash"), businessDate: end },
      machine: { total: avg(m, "entities"), needService: avg(m, "_service"), totalActualCash: avg(m, "openingCash"), businessDate: end,
        serviceBreakdown: [["Deliver", "deliveryCount"], ["Pickup", "pickupCount"], ["No Action", "noActionCount"]].map(([action, key]) => ({ action, count: avg(m, key) })) },
    },
    plan: { trucks: avg(r, "entities"), totalStops: sum(r, "stops"), totalDistanceKm: sum(r, "distance"), totalDurationMinutes: sum(r, "duration") * 60,
      avgDurationMinutes: sum(r, "duration") * 60 / Math.max(1, routes.length), maxDurationMinutes: Math.max(0, ...routes.map((row) => row.durationMinutes!)),
      otTrucks: routes.filter((row) => row.otHours! > 0).length / Math.max(1, dates.length), deliveryAmountBranch: sum(r, "deliveryBranch"), deliveryAmountMachine: 0,
      avgUtilizationPct: sum(r, "_load") / Math.max(1, sum(r, "_capacity")) * 100, avgSlaPct: sum(r, "_slaTotal") / Math.max(1, sum(r, "_slaCount")),
      stopsByType: { Branch: { count: sum(r, "stops"), distinct: branch.planned } }, businessDate: end },
    coverage: { branch, machine: { demand: avg(m, "_service"), planned: 0, covered: 0, unserved: avg(m, "_service"), extra: 0 } },
    cost: { cot, cof, citTotal: cot + cof }, cashUnderManagement: avg(b, "openingCash") + avg(m, "openingCash"),
  };
}

export function mockResponse(path: string, init?: RequestInit): Response {
  const url = new URL(path, "http://mock.local");
  const endpoint = url.pathname.replace("/api/v2/", "");
  const date = url.searchParams.get("date") || MOCK_END;
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
  if (init?.method && init.method !== "GET") {
    if (init.method !== "POST") return json({ error: "Unsupported mock method" }, 405);
    const config = readConfig(), body = JSON.parse(String(init.body ?? "{}"));
    if (endpoint === "fleet/availability") {
      if (typeof body.isAvailable !== "boolean" || !config.trucks.some((t) => t.truckId === body.truckId)) return json({ error: "Invalid truck" }, 400);
      config.trucks = config.trucks.map((t) => t.truckId === body.truckId ? { ...t, isAvailable: body.isAvailable } : t);
    } else if (endpoint === "route-params") {
      if (!Number.isFinite(body.value) || !config.params.some((p) => p.parameter === body.parameter)) return json({ error: "Invalid parameter" }, 400);
      config.params = config.params.map((p) => p.parameter === body.parameter ? { ...p, value: body.value } : p);
    } else return json({ error: "Unknown mock endpoint" }, 404);
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); }
    catch { return json({ error: "Unable to save demo settings in this browser" }, 503); }
    return json({ success: true, source: "mock" });
  }
  if (endpoint === "health") return json({ source: "mock", useUnityCatalog: false, businessDate: MOCK_END });
  if (endpoint === "date-range") return json({ source: "mock", ...mockDateRange });
  if (endpoint === "reports/available-dates") return json({ dates: MOCK_DATES });
  if (endpoint === "branch-tracks") return json({ source: "mock", businessDate: date, branches: mockBranches(date) });
  if (endpoint === "machine-tracks") return json({ source: "mock", businessDate: date, machines: mockMachines(date) });
  if (endpoint === "branch-inputs") return json({ source: "mock", branches: mockBranchInputs(date) });
  if (endpoint === "route-executions") return json({ source: "mock", businessDate: date, routes: mockRoutes(date) });
  if (endpoint === "fleet") return json({ source: "mock", trucks: readConfig().trucks });
  if (endpoint === "route-params") return json({ source: "mock", params: readConfig().params });
  if (endpoint === "overview-summary") return json(mockOverview(date, url.searchParams.get("period") || "day"));
  if (endpoint.startsWith("trends/")) {
    const dataset = endpoint.split("/")[1] as TrackingDataset;
    const period = (url.searchParams.get("period") || "week") as TrendPeriod;
    const end = url.searchParams.get("end") || MOCK_END;
    if (!["branches", "machines", "routes"].includes(dataset) || !["3days", "week", "month", "quarter", "year"].includes(period) || !MOCK_DATES.includes(end)) return json({ error: "Invalid trend selection" }, 400);
    return json(mockTrends(dataset, period, end));
  }
  return json({ error: `No local mock for ${endpoint}` }, 404);
}
