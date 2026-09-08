import { afterEach, expect, it, vi } from "vitest";
import { fetchBranchesFromApi, fetchMachinesFromApi, fetchRoutesFromApi, fetchDateRange } from "./backend";

afterEach(() => vi.unstubAllGlobals());

it("preserves each latest date returned by the backend without sending a shared date", async () => {
  const fetch = vi.fn(async (url: string) => ({ ok: true, json: async () =>
    url.includes("branch-tracks") ? { source: "unity_catalog", businessDate: "2026-09-05", branches: [{}] }
      : url.includes("machine-tracks") ? { source: "unity_catalog", businessDate: "2026-09-07", machines: [{}] }
      : { source: "unity_catalog", businessDate: "2026-09-09", routes: [{}] },
  }));
  vi.stubGlobal("fetch", fetch);
  expect((await fetchBranchesFromApi())?.businessDate).toBe("2026-09-05");
  expect((await fetchMachinesFromApi())?.businessDate).toBe("2026-09-07");
  expect((await fetchRoutesFromApi("OPTIMIZED"))?.businessDate).toBe("2026-09-09");
  expect(fetch.mock.calls.every(([url]) => !url.includes("date="))).toBe(true);
});

it("requests available dates for the page's dataset", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ dates: ["2026-09-09"], minDate: "2026-09-09", maxDate: "2026-09-09" }) });
  vi.stubGlobal("fetch", fetch);
  expect((await fetchDateRange("routes"))?.dates).toEqual(["2026-09-09"]);
  expect(fetch).toHaveBeenCalledWith("/api/v2/date-range?dataset=routes");
});

it("preserves an empty response and its date instead of triggering mock fallback", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ source: "unity_catalog", businessDate: "2026-09-09", branches: [] }) }));
  expect(await fetchBranchesFromApi("2026-09-09")).toEqual({ source: "unity_catalog", businessDate: "2026-09-09", branches: [] });
});
