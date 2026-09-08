import { afterEach, expect, it, vi } from "vitest";
import { fetchTrends } from "./trends";

afterEach(() => vi.unstubAllGlobals());
it("sends the selected range, date and cancellation signal", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ metrics: [] }) });
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  await fetchTrends("branches", "quarter", "2026-09-05", controller.signal);
  expect(fetch).toHaveBeenCalledWith("/api/v2/trends/branches?period=quarter&end=2026-09-05", { signal: controller.signal });
});
it("uses the dataset latest when no end is supplied and surfaces failures", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false });
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  await expect(fetchTrends("routes", "year", "", controller.signal)).rejects.toThrow("Trends could not be loaded");
  expect(fetch).toHaveBeenCalledWith("/api/v2/trends/routes?period=year", { signal: controller.signal });
});
