import { trendDate } from "@/utils/trends";

export function weekEarlier(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const day = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(day.getTime())) return "";
  day.setUTCDate(day.getUTCDate() - 7);
  return day.toISOString().slice(0, 10);
}

/** Counts/amounts use relative change; rates already on a 0–100 scale use points. */
export function dailyComparison(current: number | null, previous: number | null, baselineDate: string,
  options: { loading?: boolean; unit?: "%" | "pp"; better?: "higher" | "lower" } = {}) {
  const compareLabel = baselineDate ? `vs ${trendDate(baselineDate)} · last week` : "vs last week";
  if (options.loading) return { sub: "Loading last-week comparison…", compareLabel };
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return { sub: baselineDate ? `Comparison unavailable · ${trendDate(baselineDate)}` : "Comparison unavailable", compareLabel };
  }
  if (options.unit !== "pp" && previous <= 0) {
    return { sub: `${current === previous ? "Unchanged" : "No percentage comparison"} · last week: ${previous}`, compareLabel };
  }
  const change = options.unit === "pp" ? current - previous : (current - previous) / previous * 100;
  const rounded = Number(change.toFixed(2));
  return { compareLabel, delta: {
    text: `${rounded > 0 ? "+" : ""}${rounded}${options.unit === "pp" ? " pp" : "%"}`,
    dir: rounded > 0 ? "up" as const : rounded < 0 ? "down" as const : "flat" as const,
    good: rounded === 0 || !options.better ? undefined : options.better === "higher" ? change > 0 : change < 0,
  } };
}
