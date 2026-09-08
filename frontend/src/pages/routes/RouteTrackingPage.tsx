import { useEffect, useMemo, useState } from "react";
import { Truck, MapPin, Ruler, CheckCircle2, Gauge, Banknote, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { thb } from "@/utils/format";
import RoutePathMap from "@/components/maps/RoutePathMap";
import ResizableSplit from "@/components/ResizableSplit";
import DateFilter from "@/components/DateFilter";
import TrendsLink from "@/components/TrendsLink";
import { useAppData } from "@/hooks/useAppData";
import { useWeeklyComparison } from "@/hooks/useWeeklyComparison";
import KpiCard, { SkeletonKpiCard } from "@/components/KpiCard";
import StatusDot from "@/components/StatusDot";
import Skeleton from "@/components/Skeleton";
import { ROUTE_STATUS_COLOR, STOP_TYPE_COLOR, summarizeRoutes } from "@/domain/routeExec";
import { COLOR } from "@/utils/colors";
import type { RouteExecution } from "@/types";

function fmtDuration(min: number): string {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

function fmtCashShort(v: number): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `฿${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `฿${(v / 1_000).toFixed(0)}K`;
  return `฿${v}`;
}

export default function RouteTrackingPage() {
  const { execs, routeSummary: summary, dataLoading } = useAppData();
  const weekly = useWeeklyComparison("routes");
  const previous = useMemo(() => weekly.rows ? summarizeRoutes(weekly.rows) : null, [weekly.rows]);
  const compare = (key: "totalRoutes" | "totalStops" | "totalDistanceKm" | "costOfTransport" | "utilizationPct" | "slaPct", better?: "higher" | "lower", unit: "%" | "pp" = "%") =>
    weekly.compare(execs.length ? summary[key] : null, previous?.[key] ?? null, better, unit);
  const navigate = useNavigate();
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");

  const selectedExec: RouteExecution | null = useMemo(
    () => execs.find((e) => e.routeId === selectedRouteId) ?? null,
    [execs, selectedRouteId]
  );

  // Map shows selected route or a synthetic "all routes" exec
  const mapExec: RouteExecution | null = useMemo(() => {
    if (selectedExec) return selectedExec;
    if (!execs.length) return null;
    // Build a synthetic "all routes" exec for multi-route map view
    const allPath: [number, number][] = execs.flatMap((e) => e.path);
    // Tag each stop with its owning route: seq restarts at 1 per route, so the
    // merged list would otherwise hold several stops numbered 1, 2, ...
    const allStops = execs.flatMap((e) =>
      e.stops
        .filter((s) => s.type !== "Start" && s.type !== "Return")
        .map((s) => ({ ...s, routeId: e.routeId }))
    );
    const depot = execs[0];
    return {
      ...depot,
      routeId: "ALL",
      label: "All Routes",
      path: allPath,
      stops: [
        { seq: 0, code: "", location: depot.depot, type: "Start" as const, category: "Depot" as const, actionType: "START", status: "Completed" as const, eta: "", etd: "", lat: depot.depotLat, lng: depot.depotLng, amount: 0, deliveryAmount: 0, pickupAmount: 0, legKm: 0, cumulativeKm: 0 },
        ...allStops,
      ],
    };
  }, [execs, selectedExec]);

  // Stops for the detail panel (selected route or all)
  const detailStops = useMemo(() => {
    if (selectedExec) return selectedExec.stops;
    return [];
  }, [selectedExec]);

  useEffect(() => {
    // Don't auto-select; default = all routes shown
  }, [execs]);

  return (
    <div className="track-page">
      <div className="page-toolbar">
        <span className="pt-title">Route Tracking · {summary.totalRoutes} trucks</span>
        <DateFilter dataset="routes" />
        <TrendsLink dataset="routes" />
      </div>

      {/* ── KPI Cards ── */}
      <div className="kpi-grid track-kpis six">
        {dataLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonKpiCard key={i} />)
        ) : (
          <>
            <KpiCard icon={<Truck size={18} color={COLOR.accent} />} label="Total Trucks" value={String(summary.totalRoutes)} {...compare("totalRoutes")} />
            <KpiCard icon={<MapPin size={18} color={COLOR.purple} />} label="Total Stops" value={String(summary.totalStops)} {...compare("totalStops")} />
            <KpiCard icon={<Ruler size={18} color={COLOR.accent} />} label="Total Distance" value={`${summary.totalDistanceKm} km`} {...compare("totalDistanceKm")} />
            <KpiCard icon={<Banknote size={18} color={COLOR.amber} />} label="Cost of Transport" value={thb(summary.costOfTransport)} tone="amber" {...compare("costOfTransport", "lower")} />
            <KpiCard icon={<Gauge size={18} color={COLOR.accent} />} label="Avg Utilization" value={`${summary.utilizationPct}%`} {...compare("utilizationPct", undefined, "pp")} />
            <KpiCard icon={<CheckCircle2 size={18} color={COLOR.green} />} label="SLA Achievement" value={summary.slaPct != null ? `${summary.slaPct}%` : "—"} tone={summary.slaPct != null ? "green" : undefined} {...compare("slaPct", "higher", "pp")} />
          </>
        )}
      </div>

      {/* ── Map + Stop Detail ── */}
      <ResizableSplit
        id="routes"
        left={
        <div className="panel" style={dataLoading ? { display: "flex", flexDirection: "column" } : undefined}>
          <div className="panel-head">
            <h2>Route Map</h2>
            <span className="hint">
              {selectedExec ? `${selectedExec.truckId} · ${selectedExec.totalStops} stops` : `${summary.totalRoutes} trucks · all routes`}
              {selectedExec && (
                <button
                  type="button"
                  className="btn sm ghost"
                  style={{ marginLeft: 8, fontSize: 10 }}
                  onClick={() => setSelectedRouteId("")}
                >
                  Show All
                </button>
              )}
            </span>
          </div>
          {dataLoading ? (
            <Skeleton height="100%" radius={0} style={{ flex: 1, minHeight: 460 }} />
          ) : mapExec ? (
            <div style={{ height: "100%", minHeight: "clamp(320px, 46vh, 520px)" }}>
              <RoutePathMap exec={mapExec} />
            </div>
          ) : (
            <div style={{ height: "clamp(320px, 46vh, 520px)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
              No route data available
            </div>
          )}
        </div>
        }
        right={
        <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
          <div className="panel-head">
            <h2>Stop Detail</h2>
            <span className="hint">
              {selectedExec ? `${selectedExec.truckId} · ${selectedExec.stops.length} stops` : "Select a truck to view stops"}
            </span>
          </div>
          <div className="panel-body" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 0 }}>
            {dataLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                  <Skeleton width="80%" height={12} style={{ marginBottom: 4 }} />
                  <Skeleton width="50%" height={10} />
                </div>
              ))
            ) : detailStops.length ? (
              <table className="branch-table" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th>Seq</th>
                    <th>Location</th>
                    <th>Type</th>
                    <th className="num">Plan ETA</th>
                    <th className="num">Actual ETA</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {detailStops.map((s) => (
                    <tr key={`${s.seq}-${s.code}`}>
                      <td style={{ fontWeight: 600, width: 36 }}>{s.seq}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{s.location || "—"}</div>
                        {s.code && <div style={{ color: "var(--muted)", fontSize: 10 }}>{s.code}</div>}
                      </td>
                      <td>
                        <span style={{ color: STOP_TYPE_COLOR[s.type] || COLOR.slate, fontWeight: 600, fontSize: 10 }}>
                          {s.category || s.type}
                        </span>
                      </td>
                      <td className="num">{s.eta || "—"}</td>
                      <td className="num" style={{ color: "var(--muted)" }}>—</td>
                      <td className="num">{s.amount ? fmtCashShort(s.amount) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 24, color: "var(--muted)", textAlign: "center" }}>
                Click a truck in the table below to view stop details
              </div>
            )}
          </div>
        </div>
        }
      />

      {/* ── Route Table ── */}
      <div className="track-split" style={{ gridTemplateColumns: "1fr" }}>
        <div className="panel">
          <div className="panel-head">
            <h2>Route Fleet Overview</h2>
            <span className="hint">{summary.totalRoutes} trucks · click row to filter map & stop detail</span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="branch-table">
              <thead>
                <tr>
                  <th>Truck</th>
                  <th className="num" style={{ textAlign: "center" }}>Stops</th>
                  <th className="num" style={{ textAlign: "center" }}>Distance</th>
                  <th style={{ textAlign: "center" }}>ETD</th>
                  <th style={{ textAlign: "center" }}>ETA</th>
                  <th className="num" style={{ textAlign: "center" }}>Cash Load</th>
                  <th className="num" style={{ textAlign: "center" }}>Util%</th>
                  <th className="num" style={{ textAlign: "center" }}>CoT</th>
                  <th className="num" style={{ textAlign: "center" }}>Duration</th>
                  <th className="num" style={{ textAlign: "center" }}>OT</th>
                  <th style={{ width: 108 }}><span className="fleet-action-heading">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {dataLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="num"><Skeleton width={50} height={11} style={{ margin: "0 auto" }} /></td>
                      ))}
                    </tr>
                  ))
                  : execs.map((e) => (
                    <tr
                      key={e.routeId}
                      className={`fleet-overview-row${e.routeId === selectedRouteId ? " is-selected" : ""}`}
                      title={e.routeId === selectedRouteId ? "Click to show all routes on the map" : `Click to show ${e.truckId} on the map`}
                      onClick={() => setSelectedRouteId(e.routeId === selectedRouteId ? "" : e.routeId)}
                    >
                      <td>
                        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                          <StatusDot color={e.color} />
                          <div>
                            {e.truckId}
                            {e.plateNumber && (
                              <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 400 }}>{e.plateNumber}</div>
                            )}
                          </div>
                          {e.routeId === selectedRouteId && (
                            <span className="badge-custom">Selected</span>
                          )}
                        </div>
                      </td>
                      <td className="num" style={{ textAlign: "center" }}>
                        {e.totalStops}

                      </td>
                      <td className="num" style={{ textAlign: "center" }}>{e.distanceKm} km</td>
                      <td style={{ textAlign: "center", fontSize: 11 }}>{e.etdStart || "—"}</td>
                      <td style={{ textAlign: "center", fontSize: 11 }}>{e.etaReturn || "—"}</td>
                      <td className="num" style={{ textAlign: "center" }}>{fmtCashShort(e.deliveryAmount)}</td>
                      <td className="num" style={{ textAlign: "center" }}>{e.utilizationPct ? `${e.utilizationPct}%` : "—"}</td>
                      <td className="num" style={{ textAlign: "center" }}>{e.costOfTransport ? thb(e.costOfTransport) : "—"}</td>
                      <td className="num" style={{ textAlign: "center" }}>{fmtDuration(e.durationMinutes ?? 0)}</td>
                      <td className="num" style={{ textAlign: "center" }}>
                        {(e.otHours ?? 0) > 0
                          ? <span style={{ color: COLOR.amber, fontWeight: 600 }}>{e.otHours}h ⚠️</span>
                          : <span style={{ color: "var(--muted)" }}>—</span>
                        }
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className="btn sm ghost fleet-detail-link"
                          title="View truck detail"
                          aria-label={`View route details for ${e.truckId}`}
                          onClick={(ev) => { ev.stopPropagation(); navigate(`/routes/${e.routeId}`); }}
                        >
                          <span className="fleet-detail-label">View route</span>
                          <ExternalLink size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
