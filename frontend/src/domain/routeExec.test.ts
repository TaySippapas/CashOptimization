import { describe, it, expect } from "vitest";
import type { RouteExecution } from "@/types";
import { summarizeRoutes } from "./routeExec";

/** Only the fields summarizeRoutes reads; the rest is irrelevant to the KPIs. */
function exec(over: Partial<RouteExecution> = {}): RouteExecution {
  return {
    routeId: "R1",
    status: "On Track",
    totalStops: 3,
    distanceKm: 10,
    utilizationPct: 50,
    costOfTransport: 100,
    slaPct: 90,
    ...over,
  } as unknown as RouteExecution;
}

describe("summarizeRoutes", () => {
  it("sums stops and distance across routes", () => {
    const s = summarizeRoutes([
      exec({ totalStops: 3, distanceKm: 10.04 }),
      exec({ totalStops: 4, distanceKm: 5.02 }),
    ]);
    expect(s.totalRoutes).toBe(2);
    expect(s.totalStops).toBe(7);
    expect(s.totalDistanceKm).toBe(15.1); // rounded to 1dp
  });

  it("averages utilisation rather than summing it", () => {
    // A rate: two trucks at 40% and 80% is 60% utilised, not 120%.
    const s = summarizeRoutes([exec({ utilizationPct: 40 }), exec({ utilizationPct: 80 })]);
    expect(s.utilizationPct).toBe(60);
  });

  it("sums cost of transport rather than averaging it", () => {
    // A flow: two trucks costing 100 each cost 200 in total.
    const s = summarizeRoutes([exec({ costOfTransport: 100 }), exec({ costOfTransport: 100 })]);
    expect(s.costOfTransport).toBe(200);
  });

  it("counts each status separately", () => {
    const s = summarizeRoutes([
      exec({ status: "On Track" }),
      exec({ status: "On Track" }),
      exec({ status: "Delayed" }),
      exec({ status: "At Risk" }),
    ]);
    expect([s.onTrack, s.delayed, s.atRisk]).toEqual([2, 1, 1]);
  });

  it("reports SLA as null when no route has one", () => {
    // null renders as "no data"; 0 would render as catastrophic SLA.
    const s = summarizeRoutes([exec({ slaPct: undefined }), exec({ slaPct: undefined })]);
    expect(s.slaPct).toBeNull();
  });

  it("ignores zero and missing SLA when averaging", () => {
    // A truck reporting 0 means "not measured" here, and would drag a real
    // 90% average down to 45% if counted.
    const s = summarizeRoutes([
      exec({ slaPct: 90 }),
      exec({ slaPct: 0 }),
      exec({ slaPct: undefined }),
    ]);
    expect(s.slaPct).toBe(90);
  });

  it("treats missing utilisation and cost as zero, not NaN", () => {
    const s = summarizeRoutes([
      exec({ utilizationPct: undefined, costOfTransport: undefined }),
      exec({ utilizationPct: 80, costOfTransport: 50 }),
    ]);
    expect(s.utilizationPct).toBe(40);
    expect(s.costOfTransport).toBe(50);
    expect(Number.isNaN(s.utilizationPct)).toBe(false);
  });

  it("returns zeros rather than NaN for an empty fleet", () => {
    const s = summarizeRoutes([]);
    expect(s).toMatchObject({
      totalRoutes: 0,
      totalStops: 0,
      totalDistanceKm: 0,
      utilizationPct: 0,
      costOfTransport: 0,
      slaPct: null,
      onTrack: 0,
      delayed: 0,
      atRisk: 0,
    });
  });
});
