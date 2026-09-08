import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReportDates, fetchReportRoutes } from "./backend";

afterEach(() => vi.unstubAllGlobals());

describe("report data requests", () => {
  it("requests optimized routes for the chosen date", async () => {
    const routes = [{ truckId: "T1" }];
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ source: "unity_catalog", businessDate: "2026-09-04", routes }) });
    vi.stubGlobal("fetch", fetch);
    expect(await fetchReportRoutes("2026-09-04")).toEqual(routes);
    expect(fetch).toHaveBeenCalledWith("/api/v2/route-executions?plan_type=OPTIMIZED&date=2026-09-04");
  });

  it.each([
    { source: "unity_catalog", businessDate: "2026-09-01" },
    { source: "mock", businessDate: "2026-09-04" },
    { source: "error", businessDate: "2026-09-04" },
  ])("rejects mismatched or fallback report data: %j", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...response, routes: [{ truckId: "T1" }] }) }));
    expect(await fetchReportRoutes("2026-09-04")).toBeNull();
  });

  it("distinguishes unavailable dates service from an empty database", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchReportDates()).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ dates: [] }) }));
    expect(await fetchReportDates()).toEqual({ dates: [] });
  });
});
