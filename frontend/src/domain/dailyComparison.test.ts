import { describe, expect, it } from "vitest";
import { dailyComparison, weekEarlier } from "./dailyComparison";

describe("selected day versus seven days earlier", () => {
  it("crosses month, year and leap-day boundaries without changing time zones", () => {
    expect(weekEarlier("2026-09-07")).toBe("2026-08-31");
    expect(weekEarlier("2026-01-03")).toBe("2025-12-27");
    expect(weekEarlier("2024-03-06")).toBe("2024-02-28");
    expect(weekEarlier("")).toBe("");
  });
  it("computes relative changes for counts and costs", () => {
    expect(dailyComparison(110, 100, "2026-08-31").delta).toMatchObject({ text: "+10%", dir: "up", good: undefined });
    expect(dailyComparison(90, 100, "2026-08-31", { better: "lower" }).delta).toMatchObject({ text: "-10%", dir: "down", good: true });
    expect(dailyComparison(14, 14, "2026-08-31").delta).toMatchObject({ text: "0%", dir: "flat", good: undefined });
  });
  it("computes rate differences in percentage points, including a valid zero rate", () => {
    expect(dailyComparison(65, 60, "2026-08-31", { unit: "pp" }).delta?.text).toBe("+5 pp");
    expect(dailyComparison(5, 0, "2026-08-31", { unit: "pp" }).delta?.text).toBe("+5 pp");
    expect(dailyComparison(0, 10, "2026-08-31", { unit: "pp" }).delta?.text).toBe("-10 pp");
  });
  it("does not invent percentage changes for missing data or zero baselines", () => {
    for (const baseline of [null, 0, -1, NaN, Infinity]) expect(dailyComparison(5, baseline, "2026-08-31").delta).toBeUndefined();
    expect(dailyComparison(0, 0, "2026-08-31").sub).toContain("Unchanged");
    expect(dailyComparison(null, 10, "2026-08-31").delta).toBeUndefined();
    expect(dailyComparison(10, 5, "2026-08-31", { loading: true }).sub).toContain("Loading");
  });
  it("shows the actual comparison date and avoids a misleading negative zero", () => {
    const result = dailyComparison(99.999999, 100, "2026-08-31");
    expect(result.compareLabel).toBe("vs 31 Aug 2026 · last week");
    expect(result.delta?.text).toBe("0%");
    expect(result.delta?.dir).toBe("flat");
  });
});
