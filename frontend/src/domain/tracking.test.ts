import { describe, it, expect } from "vitest";
import type { BranchTrack, Machine } from "@/types";
import { summarizeBranchTracks, summarizeMachines } from "./tracking";

function machine(over: Partial<Machine> = {}): Machine {
  return {
    id: "M1",
    action: "No Action",
    health: "Healthy",
    emergency: false,
    denomination: { b1000: 50, b500: 30, b100: 20, b50: 0 },
    trend: [
      { day: "Mon", deposit: 100, withdraw: 40, net: 60 },
      { day: "Tue", deposit: 200, withdraw: 50, net: 150 },
    ],
    ...over,
  } as unknown as Machine;
}

function branch(over: Partial<BranchTrack> = {}): BranchTrack {
  return {
    code: "0533",
    action: "No Action",
    emergency: false,
    trend: [
      { day: "Mon", deposit: 10, withdraw: 4, net: 6 },
      { day: "Tue", deposit: 20, withdraw: 5, net: 15 },
    ],
    denominationGap: { b1000: 1, b500: 2, b100: 3, b50: 4 },
    ...over,
  } as unknown as BranchTrack;
}

describe("summarizeMachines", () => {
  it("counts machines by action and health", () => {
    const s = summarizeMachines([
      machine({ action: "Pickup" }),
      machine({ action: "Deliver" }),
      machine({ action: "No Action", health: "Critical" }),
      machine({ action: "No Action", emergency: true }),
    ]);
    expect(s.total).toBe(4);
    expect(s.pickup).toBe(1);
    expect(s.deliver).toBe(1);
    expect(s.noAction).toBe(2);
    expect(s.healthy).toBe(3);
    expect(s.emergency).toBe(1);
  });

  it("adds up each day of the trend across machines", () => {
    const s = summarizeMachines([machine(), machine()]);
    expect(s.trendAll).toEqual([
      { day: "Mon", deposit: 200, withdraw: 80, net: 120 },
      { day: "Tue", deposit: 400, withdraw: 100, net: 300 },
    ]);
  });

  it("normalises the denomination mix to percentages", () => {
    // Raw note counts are summed, then expressed as a share of the total.
    const s = summarizeMachines([
      machine({ denomination: { b1000: 10, b500: 10, b100: 0, b50: 0 } as never }),
      machine({ denomination: { b1000: 30, b500: 10, b100: 0, b50: 0 } as never }),
    ]);
    expect(s.denominationMix).toEqual({ b1000: 67, b500: 33, b100: 0, b50: 0 });
    const total = Object.values(s.denominationMix).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeGreaterThanOrEqual(99); // rounding may cost a point
    expect(total).toBeLessThanOrEqual(101);
  });

  it("survives machines whose trends are different lengths", () => {
    // Trend length is taken from the first machine; a shorter one must not
    // produce NaN in the totals.
    const s = summarizeMachines([
      machine(),
      machine({ trend: [{ day: "Mon", deposit: 5, withdraw: 1, net: 4 }] as never }),
    ]);
    expect(s.trendAll[1].deposit).toBe(200);
    expect(Number.isNaN(s.trendAll[1].deposit)).toBe(false);
  });

  it("returns an empty summary for no machines", () => {
    const s = summarizeMachines([]);
    expect(s.total).toBe(0);
    expect(s.trendAll).toEqual([]);
  });
});

describe("summarizeBranchTracks", () => {
  it("counts branches by action", () => {
    const s = summarizeBranchTracks([
      branch({ action: "Deliver" }),
      branch({ action: "Pickup" }),
      branch({ action: "Both" }),
      branch({ action: "No Action", emergency: true }),
    ]);
    expect(s.total).toBe(4);
    expect(s.delivery).toBe(1);
    expect(s.pickup).toBe(1);
    expect(s.both).toBe(1);
    expect(s.noAction).toBe(1);
    expect(s.emergency).toBe(1);
  });

  it("adds up each day of the trend across branches", () => {
    const s = summarizeBranchTracks([branch(), branch(), branch()]);
    expect(s.trendAll).toEqual([
      { day: "Mon", deposit: 30, withdraw: 12, net: 18 },
      { day: "Tue", deposit: 60, withdraw: 15, net: 45 },
    ]);
  });

  it("sums the denomination gap per note value", () => {
    const s = summarizeBranchTracks([branch(), branch()]);
    expect(s.denominationGap).toMatchObject({ b1000: 2, b500: 4, b100: 6, b50: 8 });
  });

  it("treats a missing gap entry as zero rather than NaN", () => {
    const s = summarizeBranchTracks([
      branch(),
      branch({ denominationGap: { b1000: 1 } as never }),
    ]);
    expect(s.denominationGap.b500).toBe(2);
    expect(Number.isNaN(s.denominationGap.b500)).toBe(false);
  });

  it("survives branches whose trends are different lengths", () => {
    // summarizeMachines guards this with ?., summarizeBranchTracks does not.
    const s = summarizeBranchTracks([
      branch(),
      branch({ trend: [{ day: "Mon", deposit: 5, withdraw: 1, net: 4 }] as never }),
    ]);
    expect(Number.isNaN(s.trendAll[1].deposit)).toBe(false);
  });

  it("returns an empty summary for no branches", () => {
    const s = summarizeBranchTracks([]);
    expect(s.total).toBe(0);
    expect(s.trendAll).toEqual([]);
  });
});
