import { describe, expect, it } from "vitest";
import { trendChange, trendDate, trendValue } from "./trends";

describe("trend formatting", () => {
  it("keeps percentage points distinct from relative percentage change", () => {
    expect(trendChange({ change: 5, changeUnit: "pp" })).toBe("+5 pp");
    expect(trendChange({ change: 8.333333, changeUnit: "%" })).toBe("+8.33%");
    expect(trendChange({ change: -5, changeUnit: "pp" })).toBe("-5 pp");
  });
  it("shows zero and missing values differently without NaN or infinity", () => {
    expect(trendValue(0, "%")).toBe("0%");
    expect(trendValue(null, "%")).toBe("—");
    expect(trendValue(Infinity, "THB")).toBe("—");
    expect(trendChange({ change: null, changeUnit: "%" })).toBe("—");
    expect(trendChange({ change: -0.00001, changeUnit: "pp" })).toBe("0 pp");
  });
  it("formats whole percent values without multiplying again", () => {
    expect(trendValue(65.25, "%")).toBe("65.25%");
    expect(trendValue(1234, "THB")).toBe("฿1,234");
  });
  it("retains years across annual windows", () => {
    expect(trendDate("2025-12-31")).toBe("31 Dec 2025");
    expect(trendDate("2026-01-01")).toBe("1 Jan 2026");
  });
});
