import type { SimResultRow } from "@/domain/scenario";
import { COLOR } from "@/utils/colors";

export function thb(n: number, compact = true): string {
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `฿${(n / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000) return `฿${(n / 1_000).toFixed(0)}K`;
  }
  return `฿${n.toLocaleString("en-US")}`;
}

export function thbB(n: number): string {
  if (n >= 1_000_000_000) return `THB ${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `THB ${(n / 1_000_000).toFixed(2)}M`;
  return thb(n, false);
}

export function km(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} km`;
}

export function hours(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} h`;
}

export function pctChange(before: number, after: number): string {
  if (!before) return "0%";
  return `${Math.round(((before - after) / before) * 1000) / 10}%`;
}

export function mapeColor(mape: number): string {
  if (mape <= 10) return COLOR.green;
  if (mape <= 15) return COLOR.amber;
  return COLOR.red;
}

export function fmtScenarioValue(row: SimResultRow): string {
  switch (row.unit) {
    case "km":
      return `${row.scenario.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
    case "hrs":
      return `${row.scenario.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`;
    case "thb":
      return thb(row.scenario);
    case "pct":
      return `${row.scenario}%`;
    default:
      return String(row.scenario);
  }
}

export function scenarioBarPct(row: SimResultRow): number {
  if (row.unit === "pct") return Math.min(100, row.scenario);
  const max = Math.max(row.base, row.scenario) || 1;
  return Math.min(100, (row.scenario / max) * 100);
}
