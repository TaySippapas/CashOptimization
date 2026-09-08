/** Fetch operational data from the FastAPI / Unity Catalog backend. */

import { apiFetch, USE_MOCK_DATA } from "./client";
import type { RouteExecution } from "@/types";

export type DataSource = "unity_catalog" | "mock" | "error" | "local";
export type TrackingDataset = "branches" | "machines" | "routes";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await apiFetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Points at the ktb_cash_route.ops dim/fact pipeline (server/uc_repo_v2.py +
// server/api/v2.py) — see docs/data/runtime-schema.md. The old
// /api/* endpoints (server/uc_repo.py) target a catalog/warehouse that isn't
// reachable from this workspace.

/** Builds a query string, omitting empty params. An absent date means
 *  "latest available" — the backend resolves MAX(business_date). */
function qs(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params).filter(([, v]) => v);
  if (!pairs.length) return "";
  return "?" + pairs.map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
}

export async function fetchMachinesFromApi(date?: string): Promise<{
  source: DataSource;
  businessDate: string;
  machines: unknown[];
} | null> {
  const data = await getJson<{ source: DataSource; businessDate?: string; machines: unknown[]; error?: string }>(
    `/api/v2/machine-tracks${qs({ date })}`
  );
  if ((data?.source !== "unity_catalog" && !(USE_MOCK_DATA && data?.source === "mock")) || !Array.isArray(data.machines)) return null;
  return { source: data.source, businessDate: data.businessDate ?? "", machines: data.machines };
}

export async function fetchBranchesFromApi(date?: string): Promise<{
  source: DataSource;
  businessDate: string;
  branches: unknown[];
} | null> {
  const data = await getJson<{ source: DataSource; businessDate?: string; branches: unknown[] }>(
    `/api/v2/branch-tracks${qs({ date })}`
  );
  if ((data?.source !== "unity_catalog" && !(USE_MOCK_DATA && data?.source === "mock")) || !Array.isArray(data.branches)) return null;
  return { source: data.source, businessDate: data.businessDate ?? "", branches: data.branches };
}

export async function fetchBranchInputsFromApi(date?: string): Promise<{
  source: DataSource;
  branches: unknown[];
} | null> {
  const data = await getJson<{ source: DataSource; branches: unknown[] }>(
    `/api/v2/branch-inputs${qs({ date })}`
  );
  if (!data?.branches?.length) return null;
  return { source: data.source, branches: data.branches };
}

export async function fetchRoutesFromApi(planType?: string, date?: string): Promise<{
  source: DataSource;
  businessDate: string;
  routes: unknown[];
} | null> {
  const data = await getJson<{ source: DataSource; businessDate?: string; routes: unknown[] }>(
    `/api/v2/route-executions${qs({ plan_type: planType, date })}`
  );
  if ((data?.source !== "unity_catalog" && !(USE_MOCK_DATA && data?.source === "mock")) || !Array.isArray(data.routes)) return null;
  return { source: data.source, businessDate: data.businessDate ?? "", routes: data.routes };
}

/** Exact dates with optimized route data, including gaps between available days. */
export async function fetchReportDates(): Promise<{ dates: string[] } | null> {
  return getJson("/api/v2/reports/available-dates");
}

/** Fetch the chosen report date explicitly; never substitute another date; demo rows are accepted only in explicit mock mode. */
export async function fetchReportRoutes(date: string): Promise<RouteExecution[] | null> {
  const data = await getJson<{
    source: DataSource;
    businessDate?: string;
    routes: RouteExecution[];
  }>(`/api/v2/route-executions${qs({ plan_type: "OPTIMIZED", date })}`);
  if ((data?.source !== "unity_catalog" && !(USE_MOCK_DATA && data?.source === "mock")) || data.businessDate !== date) return null;
  return data.routes ?? null;
}

/** Range of business dates that actually have data, for bounding the picker. */
export async function fetchDateRange(dataset: TrackingDataset = "branches"): Promise<{ dates: string[]; minDate: string | null; maxDate: string | null } | null> {
  return getJson(`/api/v2/date-range${qs({ dataset })}`);
}

export async function fetchHealth(): Promise<{
  useUnityCatalog?: boolean;
  catalog?: string;
  schema?: string;
  businessDate?: string;
  warehouseId?: string;
} | null> {
  return getJson("/api/v2/health");
}
