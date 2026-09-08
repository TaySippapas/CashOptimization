import type { TrackingDataset } from "@/api/backend";

export const TREND_PERIODS = [
  { key: "3days", label: "3 days", days: 3 },
  { key: "week", label: "1 week", days: 7 },
  { key: "month", label: "1 month", days: 30 },
  { key: "quarter", label: "3 months", days: 90 },
  { key: "year", label: "1 year", days: 365 },
] as const;
export type TrendPeriod = typeof TREND_PERIODS[number]["key"];
export const TREND_DATASETS: Record<TrackingDataset, string> = { branches: "Branches", machines: "Machines", routes: "Routes" };
export type TrendUnit = "THB" | "count" | "km" | "hours" | "%" | "THB/km";
export interface TrendMetric {
  key: string; label: string; group: string; unit: TrendUnit;
  rollup: "sum" | "average" | "ratio"; note: string;
  value: number | null; previousValue: number | null;
  change: number | null; changeUnit: "%" | "pp";
  coveredDays: number; previousCoveredDays: number;
}
export interface TrendData {
  dataset: TrackingDataset; period: TrendPeriod; periodDays: number;
  start: string; end: string; previousStart: string; previousEnd: string;
  availableStart: string | null; availableEnd: string | null; coveredDays: number;
  metrics: TrendMetric[]; points: Array<{ date: string; [key: string]: string | number | null }>;
}
