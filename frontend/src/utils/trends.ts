import type { TrendMetric, TrendUnit } from "@/domain/trends";

export function trendValue(value: number | null, unit: TrendUnit, compact = false): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const number = new Intl.NumberFormat("en-GB", {
    notation: compact ? "compact" : "standard", maximumFractionDigits: unit === "THB" && !compact ? 0 : 2,
  }).format(value);
  if (unit === "%") return `${number}%`;
  if (unit === "THB") return `฿${number}`;
  if (unit === "THB/km") return `฿${number}/km`;
  return `${number}${unit === "count" ? "" : unit === "hours" ? " h" : " km"}`;
}

export function trendChange(metric: Pick<TrendMetric, "change" | "changeUnit">): string {
  if (metric.change === null || !Number.isFinite(metric.change)) return "—";
  const rounded = Number(metric.change.toFixed(2));
  return `${rounded > 0 ? "+" : ""}${Object.is(rounded, -0) ? 0 : rounded}${metric.changeUnit === "pp" ? " pp" : "%"}`;
}

export function trendDate(date: string, year = true): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
}

export function trendRollup(metric: TrendMetric): string {
  if (metric.rollup === "sum") return "Period total";
  if (metric.rollup === "average") return "Daily average";
  if (metric.key === "sla") return "Mean across routes";
  return metric.unit === "%" ? "Weighted period rate" : "Period unit cost";
}
