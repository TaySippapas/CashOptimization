import { fetchBranchesFromApi, fetchMachinesFromApi, fetchRoutesFromApi, type TrackingDataset } from "./backend";
import type { BranchTrack, Machine, RouteExecution } from "@/types";

export type ComparisonRows = { branches: BranchTrack[]; machines: Machine[]; routes: RouteExecution[] };

export async function fetchComparisonRows<D extends TrackingDataset>(dataset: D, date: string): Promise<ComparisonRows[D] | null> {
  const result = dataset === "branches" ? await fetchBranchesFromApi(date)
    : dataset === "machines" ? await fetchMachinesFromApi(date) : await fetchRoutesFromApi("OPTIMIZED", date);
  // A missing date must not be compared with the latest snapshot or treated as zero.
  if (!result || result.businessDate !== date) return null;
  const rows = "branches" in result ? result.branches : "machines" in result ? result.machines : result.routes;
  return rows.length ? rows as ComparisonRows[D] : null;
}
