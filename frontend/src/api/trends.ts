import type { TrackingDataset } from "./backend";
import type { TrendData, TrendPeriod } from "@/domain/trends";

export async function fetchTrends(dataset: TrackingDataset, period: TrendPeriod, end: string, signal: AbortSignal): Promise<TrendData> {
  const params = new URLSearchParams({ period });
  if (end) params.set("end", end);
  const response = await fetch(`/api/v2/trends/${dataset}?${params}`, { signal });
  if (!response.ok) throw new Error("Trends could not be loaded. Please retry.");
  return response.json();
}
