import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockResponse } from "./frontendApi";
import { MOCK_END, MOCK_DATES, mockBranches, mockMachines, mockRoutes, shiftDate } from "./snapshots";
import { mockTrends } from "./trends";
import { TREND_PERIODS } from "@/domain/trends";
import { reportPreview, generateReport } from "@/domain/reportsData";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Mock mode must not use the network"); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("standalone frontend data", () => {
  it("covers tracking, date pickers, reports, overview and configuration without a backend", async () => {
    const paths = ["health", "date-range?dataset=machines", "reports/available-dates", "branch-tracks", "machine-tracks", "branch-inputs", "route-executions", "fleet", "route-params", "overview-summary?period=week"];
    for (const path of paths) {
      const response = mockResponse(`/api/v2/${path}`);
      expect(response.status, path).toBe(200);
      const data = await response.json();
      expect(data.error, path).toBeUndefined();
      expect(JSON.stringify(data)).not.toMatch(/NaN|Infinity/);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(MOCK_DATES).toHaveLength(730);
    expect(MOCK_DATES[729]).toBe(MOCK_END);
    expect(new Set(mockMachines(MOCK_END).map((m) => m.machineType))).toEqual(new Set(["ATM", "RCM", "3IN1"]));
  });

  it("varies selected dates deterministically and keeps forecasts internally consistent", () => {
    const branches = mockBranches(MOCK_END), machines = mockMachines(MOCK_END);
    expect(branches.length).toBeGreaterThan(0);
    expect(branches).toEqual(mockBranches(MOCK_END));
    expect(branches[0].currentCash).not.toBe(mockBranches(shiftDate(MOCK_END, -1))[0].currentCash);
    for (const b of branches) {
      expect(b.forecastNet).toBe(b.deposit - b.withdraw);
      expect(b.predictedCash).toBe(b.currentCash + b.forecastNet);
      expect(b.trend[b.trend.length - 1]?.deposit).toBe(b.deposit);
    }
    for (const m of machines) {
      expect(m.predictedEod).toBe(m.currentCash + m.depositToday - m.withdrawToday);
      expect(m.denominationDetail).toHaveLength(3);
    }
    expect(mockBranches("1900-01-01")).toEqual([]);
    expect(mockRoutes("1900-01-01")).toEqual([]);
  });

  it.each(["branches", "machines", "routes"] as const)("supports all five trend ranges for %s", (dataset) => {
    for (const period of TREND_PERIODS) {
      const data = mockTrends(dataset, period.key);
      expect(data.points).toHaveLength(period.days);
      expect(data.coveredDays).toBe(period.days);
      expect(data.previousEnd).toBe(shiftDate(data.start, -1));
      expect(data.metrics.find((m) => m.key === "entities")?.previousCoveredDays).toBe(period.days);
      expect(data.metrics.every((m) => m.value === null || Number.isFinite(m.value))).toBe(true);
      if (dataset !== "routes") {
        const actual = data.metrics.find((m) => m.key === "actualDeposit")!;
        expect(actual.coveredDays).toBe(period.days - 1);
        expect(actual.change).toBeNull();
        expect(data.points[data.points.length - 1]?.actualDeposit).toBeNull();
      }
    }
  });

  it("matches tracking totals and preserves percentage-point changes", () => {
    const data = mockTrends("branches", "3days");
    const sum = mockBranches(MOCK_END).reduce((total, b) => total + b.deposit, 0);
    expect(data.points[data.points.length - 1]?.forecastDeposit).toBe(sum);
    const rate = data.metrics.find((m) => m.key === "utilization")!;
    expect(rate.changeUnit).toBe("pp");
    expect(rate.change).toBeCloseTo(rate.value! - rate.previousValue!);
    const older = mockTrends("branches", "week", shiftDate(MOCK_END, -7));
    expect(older.points[older.points.length - 1]?.actualDeposit).toBeNull();
    expect(mockTrends("branches", "year", MOCK_DATES[10]).metrics.find((m) => m.key === "openingCash")?.change).toBeNull();
  });

  it("keeps route totals consistent with stop rows and report exports", () => {
    const routes = mockRoutes(MOCK_END);
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      expect(r.deliveryAmount).toBe(r.stops.reduce((total, s) => total + s.deliveryAmount!, 0));
      expect(r.pickupAmount).toBe(r.stops.reduce((total, s) => total + s.pickupAmount!, 0));
      expect(r.stops[r.stops.length - 1]?.cumulativeKm).toBeCloseTo(r.distanceKm);
      expect(r.costOfTransport).toBeCloseTo(r.fuelCost! + r.repairCost! + r.maintenanceCost! + r.normalWage! + r.otWage!);
    }
    expect(reportPreview(routes)).toBeTruthy();
    const click = vi.fn();
    vi.stubGlobal("document", { createElement: () => ({ click }) });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:demo");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    expect(generateReport(routes, { reportId: "route-truck", planType: "PLAN", date: MOCK_END }).ok).toBe(true);
    expect(generateReport(routes, { reportId: "route-stop", planType: "PLAN", date: MOCK_END }).ok).toBe(true);
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("persists demo configuration locally and rejects invalid writes", async () => {
    const initial = await mockResponse("/api/v2/fleet").json();
    const truckId = initial.trucks[0].truckId;
    const saved = mockResponse("/api/v2/fleet/availability", { method: "POST", body: JSON.stringify({ truckId, isAvailable: false }) });
    expect(saved.status).toBe(200);
    expect((await mockResponse("/api/v2/fleet").json()).trucks[0].isAvailable).toBe(false);
    const params = await mockResponse("/api/v2/route-params").json();
    expect(mockResponse("/api/v2/route-params", { method: "POST", body: JSON.stringify({ parameter: params.params[0].parameter, value: 7.25 }) }).status).toBe(200);
    expect((await mockResponse("/api/v2/route-params").json()).params[0].value).toBe(7.25);
    expect(mockResponse("/api/v2/route-params", { method: "POST", body: JSON.stringify({ parameter: "unknown", value: 7 }) }).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses mock API contracts only when the mode is explicitly enabled", async () => {
    vi.stubEnv("VITE_DATA_MODE", "mock");
    vi.resetModules();
    const api = await import("@/api/backend");
    const { apiFetch } = await import("@/api/client");
    expect((await api.fetchBranchesFromApi())?.source).toBe("mock");
    expect((await api.fetchMachinesFromApi())?.machines.length).toBeGreaterThan(0);
    expect((await api.fetchReportRoutes(MOCK_END))?.length).toBeGreaterThan(0);
    const controller = new AbortController();
    controller.abort();
    await expect(apiFetch("/api/v2/health", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
