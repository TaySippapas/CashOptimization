import type { RouteExecution } from "@/types";

/* ================================================================
   Report registry — universal pattern for adding future reports
   ================================================================ */

export type ReportId = "route-truck" | "route-stop";

export interface ReportOutput {
  id: ReportId;
  title: string;
  description: string;
}

export interface ReportDef {
  id: string;
  title: string;
  description: string;
  outputs: ReportOutput[];
}

export const REPORT_REGISTRY: ReportDef[] = [
  {
    id: "route-report",
    title: "Route Report",
    description: "Truck summary and stop-level detail for route operations",
    outputs: [
      {
        id: "route-truck",
        title: "Truck Summary",
        description: "Cost breakdown per vehicle",
      },
      {
        id: "route-stop",
        title: "Stop Detail",
        description: "All stops with arrival / departure times",
      },
    ],
  },
];

export type PlanTypeLabel = "PLAN" | "ACTUAL";

export interface GenerateOptions {
  reportId: ReportId;
  planType: PlanTypeLabel;
  date: string;           // ISO yyyy-MM-dd
}

/* ================================================================
   CSV helpers
   ================================================================ */

function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  rows.forEach((r) => lines.push(r.map(csvEscape).join(",")));
  return "\uFEFF" + lines.join("\n");  // BOM for Excel Thai support
}

function downloadBlob(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ================================================================
   Truck Summary CSV  (= "Cost by Car" sheet from reference)
   ================================================================ */

function buildTruckSummaryCsv(execs: RouteExecution[]): string {
  const headers = [
    "vehicle_code", "plate_number",
    "total_stops", "machine_stops", "total_km",
    "delivery_amount_thb", "pickup_amount_thb",
    "capacity_thb", "utilization_pct",
    "etd_start", "eta_return", "duration_minutes",
    "normal_hours", "ot_hours",
    "fuel_cost", "repair_cost", "maintenance_cost",
    "normal_wage", "ot_wage", "driver_wage",
    "total_cost",
  ];
  const rows = execs.map((e) => {
    const nw = e.normalWage ?? 0;
    const ow = e.otWage ?? 0;
    return [
      e.truckId, e.plateNumber ?? "",
      e.totalStops, e.machineStops ?? 0, e.distanceKm,
      e.deliveryAmount, e.pickupAmount,
      e.vehicleCapacity, e.utilizationPct ?? 0,
      e.etdStart ?? "", e.etaReturn ?? "", e.durationMinutes ?? 0,
      e.normalHours ?? 0, e.otHours ?? 0,
      e.fuelCost ?? 0, e.repairCost ?? 0, e.maintenanceCost ?? 0,
      nw, ow, nw + ow,
      e.costOfTransport ?? 0,
    ];
  });
  return toCsv(headers, rows);
}

/* ================================================================
   Stop Detail CSV  (= "Routes" sheet from reference)
   ================================================================ */

function timeToMin(t: string | undefined): number {
  if (!t) return 0;
  const p = t.split(":").map(Number);
  return (p[0] ?? 0) * 60 + (p[1] ?? 0) + (p[2] ?? 0) / 60;
}

function buildStopDetailCsv(execs: RouteExecution[]): string {
  const headers = [
    "vehicle_code", "plate_number",
    "seq", "stop_code", "location", "category", "action_type",
    "arrival_time", "depart_time", "service_min",
    "delivery_amount_thb", "pickup_amount_thb",
    "leg_km", "cumulative_km", "lat", "lng",
  ];
  const rows: (string | number)[][] = [];
  for (const e of execs) {
    for (const s of e.stops) {
      const svc = (s.eta && s.etd) ? Math.max(0, Math.round(timeToMin(s.etd) - timeToMin(s.eta))) : 0;
      rows.push([
        e.truckId, e.plateNumber ?? "",
        s.seq, s.code, s.location, s.category ?? "", s.actionType ?? s.type,
        s.eta ?? "", s.etd ?? "", svc,
        s.deliveryAmount ?? 0, s.pickupAmount ?? 0,
        s.legKm ?? 0, s.cumulativeKm ?? 0, s.lat, s.lng,
      ]);
    }
  }
  return toCsv(headers, rows);
}

/* ================================================================
   Generate & download
   ================================================================ */

export function generateReport(
  execs: RouteExecution[],
  opts: GenerateOptions,
): { ok: boolean; message: string } {
  if (!execs.length) {
    return { ok: false, message: "No route data available for the selected date" };
  }

  const suffix = `${opts.planType}_${opts.date}`;
  let csv: string;
  let filename: string;

  switch (opts.reportId) {
    case "route-truck":
      csv = buildTruckSummaryCsv(execs);
      filename = `Route_Report_${suffix}_by_truck.csv`;
      break;
    case "route-stop":
      csv = buildStopDetailCsv(execs);
      filename = `Route_Report_${suffix}_stops.csv`;
      break;
    default:
      return { ok: false, message: `Unknown report: ${opts.reportId}` };
  }

  downloadBlob(csv, filename);
  return { ok: true, message: `Downloaded ${filename} (${execs.length} trucks)` };
}

/* ================================================================
   Preview summary  (for the report page stats strip)
   ================================================================ */

export function reportPreview(execs: RouteExecution[]) {
  const trucks = execs.length;
  const stops = execs.reduce((s, e) => s + e.totalStops, 0);
  const km = execs.reduce((s, e) => s + e.distanceKm, 0);
  const cost = execs.reduce((s, e) => s + (e.costOfTransport ?? 0), 0);
  return { trucks, stops, km: Math.round(km * 100) / 100, cost };
}
