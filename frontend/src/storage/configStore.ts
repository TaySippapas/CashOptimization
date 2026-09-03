import type { AppConfig, BranchInput } from "@/types";
import { DEFAULT_CONFIG, DEFAULT_PARAMS } from "@/mocks/mockData";
import { CONFIG_KEY as STORAGE_KEY } from "./keys";

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_CONFIG);
    const parsed = JSON.parse(raw) as AppConfig;
    // Merge params so new fields fall back to defaults.
    return {
      params: { ...DEFAULT_PARAMS, ...parsed.params },
      branches: parsed.branches ?? DEFAULT_CONFIG.branches,
    };
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(config: AppConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore quota errors */
  }
}

export function resetConfig(): AppConfig {
  localStorage.removeItem(STORAGE_KEY);
  return structuredClone(DEFAULT_CONFIG);
}

export function exportConfigJson(config: AppConfig): string {
  return JSON.stringify(config, null, 2);
}

// ---- CSV (branches only) ----
export const BRANCH_CSV_HEADER =
  "code,name,district,lat,lng,isDepot,cashCapacity,minThreshold,openingCash,predictedInflow,predictedOutflow";

export function branchesToCsv(branches: BranchInput[]): string {
  const lines = [BRANCH_CSV_HEADER];
  for (const b of branches) {
    lines.push(
      [
        b.code,
        `"${b.name}"`,
        `"${b.district}"`,
        b.lat,
        b.lng,
        b.isDepot ? "true" : "false",
        b.cashCapacity,
        b.minThreshold,
        b.openingCash,
        b.predictedInflow,
        b.predictedOutflow,
      ].join(",")
    );
  }
  return lines.join("\n");
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function csvToBranches(csv: string): BranchInput[] {
  const rows = csv.trim().split(/\r?\n/);
  const header = splitCsvLine(rows[0]).map((h) => h.toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const out: BranchInput[] = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i].trim()) continue;
    const c = splitCsvLine(rows[i]);
    const num = (name: string) => Number(c[idx(name)] ?? 0) || 0;
    out.push({
      code: c[idx("code")] ?? `B${i}`,
      name: c[idx("name")] ?? "",
      district: c[idx("district")] ?? "",
      lat: num("lat"),
      lng: num("lng"),
      isDepot: (c[idx("isdepot")] ?? "false").toLowerCase() === "true",
      cashCapacity: num("cashcapacity"),
      minThreshold: num("minthreshold"),
      openingCash: num("openingcash"),
      predictedInflow: num("predictedinflow"),
      predictedOutflow: num("predictedoutflow"),
    });
  }
  return out;
}

export function download(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
