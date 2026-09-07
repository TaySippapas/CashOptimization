/** Fetch operational data from the FastAPI / Unity Catalog backend. */

export type DataSource = "unity_catalog" | "mock" | "error" | "local";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
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
  if (!data) return null;
  if (!data.machines?.length) return null;
  return { source: data.source, businessDate: data.businessDate ?? "", machines: data.machines };
}

export async function fetchBranchesFromApi(date?: string): Promise<{
  source: DataSource;
  branches: unknown[];
} | null> {
  const data = await getJson<{ source: DataSource; branches: unknown[] }>(
    `/api/v2/branch-tracks${qs({ date })}`
  );
  if (!data) return null;
  if (!data.branches?.length) return null;
  return { source: data.source, branches: data.branches };
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
  routes: unknown[];
} | null> {
  const data = await getJson<{ source: DataSource; routes: unknown[] }>(
    `/api/v2/route-executions${qs({ plan_type: planType, date })}`
  );
  if (!data?.routes?.length) return null;
  return { source: data.source, routes: data.routes };
}

/** Range of business dates that actually have data, for bounding the picker. */
export async function fetchDateRange(): Promise<{ minDate?: string; maxDate?: string } | null> {
  return getJson("/api/v2/date-range");
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
