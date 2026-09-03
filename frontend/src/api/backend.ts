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
// server/router_v2.py) — see DATABRICKS_NEW_PIPELINE_PROCEDURE.md. The old
// /api/* endpoints (server/uc_repo.py) target a catalog/warehouse that isn't
// reachable from this workspace.

export async function fetchMachinesFromApi(): Promise<{
  source: DataSource;
  businessDate: string;
  machines: unknown[];
} | null> {
  const data = await getJson<{ source: DataSource; businessDate?: string; machines: unknown[]; error?: string }>(
    "/api/v2/machine-tracks"
  );
  if (!data) return null;
  if (!data.machines?.length) return null;
  return { source: data.source, businessDate: data.businessDate ?? "", machines: data.machines };
}

export async function fetchBranchesFromApi(): Promise<{
  source: DataSource;
  branches: unknown[];
} | null> {
  const data = await getJson<{ source: DataSource; branches: unknown[] }>("/api/v2/branch-tracks");
  if (!data) return null;
  if (!data.branches?.length) return null;
  return { source: data.source, branches: data.branches };
}

export async function fetchBranchInputsFromApi(): Promise<{
  source: DataSource;
  branches: unknown[];
} | null> {
  const data = await getJson<{ source: DataSource; branches: unknown[] }>("/api/v2/branch-inputs");
  if (!data?.branches?.length) return null;
  return { source: data.source, branches: data.branches };
}

export async function fetchRoutesFromApi(planType?: string): Promise<{
  source: DataSource;
  routes: unknown[];
} | null> {
  const q = planType ? `?plan_type=${encodeURIComponent(planType)}` : "";
  const data = await getJson<{ source: DataSource; routes: unknown[] }>(`/api/v2/route-executions${q}`);
  if (!data?.routes?.length) return null;
  return { source: data.source, routes: data.routes };
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
