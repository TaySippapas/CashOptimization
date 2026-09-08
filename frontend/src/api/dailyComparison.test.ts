import { afterEach, expect, it, vi } from "vitest";
import { fetchComparisonRows } from "./dailyComparison";

afterEach(() => vi.unstubAllGlobals());
it.each([
  ["branches", "branch-tracks", "branches"],
  ["machines", "machine-tracks", "machines"],
  ["routes", "route-executions", "routes"],
] as const)("requests the exact comparison day for %s", async (dataset, endpoint, field) => {
  const rows = [{ id: "demo" }];
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ source: "unity_catalog", businessDate: "2026-08-31", [field]: rows }) });
  vi.stubGlobal("fetch", fetch);
  expect(await fetchComparisonRows(dataset, "2026-08-31")).toEqual(rows);
  expect(fetch).toHaveBeenCalledWith(`/api/v2/${endpoint}?${dataset === "routes" ? "plan_type=OPTIMIZED&" : ""}date=2026-08-31`);
});
it("rejects empty, mismatched and failed historical responses instead of treating them as zero", async () => {
  for (const payload of [
    { source: "unity_catalog", businessDate: "2026-09-07", machines: [{ id: "latest" }] },
    { source: "unity_catalog", businessDate: "2026-08-31", machines: [] },
    { source: "mock", businessDate: "2026-08-31", machines: [{ id: "mock" }] },
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    expect(await fetchComparisonRows("machines", "2026-08-31")).toBeNull();
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  expect(await fetchComparisonRows("machines", "2026-08-31")).toBeNull();
});
