import { useMemo, useState } from "react";
import {
  Banknote,
  PiggyBank,
  Truck,
  TrendingDown,
  Building2,
  CheckCircle2,
  Gauge,
  Filter,
  MoreVertical,
  Calendar,
  MapPin,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { buildExecutiveMetrics } from "@/domain/executiveOverview";
import { generateBranchTracks, RISK_COLOR } from "@/domain/tracking";
import { thb, thbB } from "@/utils/format";
import HealthMap, { type MapPoint } from "@/components/maps/HealthMap";
import DateFilter from "@/components/DateFilter";
import { useAppData } from "@/hooks/useAppData";
import KpiCard, { SkeletonKpiCard } from "@/components/KpiCard";
import StatusDot from "@/components/StatusDot";
import Pill from "@/components/Pill";
import Skeleton from "@/components/Skeleton";
import { COLOR } from "@/utils/colors";

const STATUS_COLOR: Record<string, string> = {
  "On Track": COLOR.green,
  Delayed: COLOR.amber,
  "At Risk": COLOR.red,
};

export default function ExecutiveOverviewPage() {
  const { config, plan, execs, routeSummary, machinesOverride, branchTracksOverride, dataLoading } = useAppData();
  const { metrics } = plan;
  const [mapLayers, setMapLayers] = useState({ machines: true, branches: true });

  const machines = useMemo(
    () => machinesOverride ?? [],
    [machinesOverride]
  );
  const branchTracks = useMemo(
    () => branchTracksOverride ?? generateBranchTracks(config),
    [branchTracksOverride, config]
  );
  const em = useMemo(
    () => buildExecutiveMetrics(config, plan, metrics, execs, routeSummary, machines),
    [config, plan, metrics, execs, routeSummary, machines]
  );

  const machinePoints = useMemo<MapPoint[]>(
    () =>
      machines.map((m) => ({
        id: `machine-${m.id}`,
        kind: "machine" as const,
        lat: m.lat,
        lng: m.lng,
        health: m.health,
        title: `${m.id} · ${m.location}`,
        rows: [
          ["Type", "Machine"],
          ["Current", thb(m.currentCash)],
          ["Predicted EOD", thb(m.predictedEod)],
          ["Action", m.action],
          ["Risk", m.riskLevel],
        ],
      })),
    [machines]
  );

  const branchPoints = useMemo<MapPoint[]>(
    () =>
      branchTracks.map((b) => ({
        id: `branch-${b.code}`,
        kind: "branch" as const,
        lat: b.lat,
        lng: b.lng,
        health: b.health,
        emphasize: b.emergency,
        title: `${b.name} · ${b.code}`,
        rows: [
          ["Type", "Branch"],
          ["Current cash", thb(b.currentCash)],
          ["Deposit", thb(b.deposit)],
          ["Withdraw", thb(b.withdraw)],
          ["Action", b.action],
        ],
      })),
    [branchTracks]
  );

  const visibleMapPoints = useMemo(() => {
    const points: MapPoint[] = [];
    if (mapLayers.machines) points.push(...machinePoints);
    if (mapLayers.branches) points.push(...branchPoints);
    return points;
  }, [mapLayers, machinePoints, branchPoints]);

  const machineCount = machinePoints.length;
  const branchCount = branchPoints.length;
  const visibleCount = visibleMapPoints.length;

  const donut = [
    { name: "On Track", value: em.routeStatus.onTrack, color: STATUS_COLOR["On Track"] },
    { name: "Delayed", value: em.routeStatus.delayed, color: STATUS_COLOR.Delayed },
    { name: "At Risk", value: em.routeStatus.atRisk, color: STATUS_COLOR["At Risk"] },
  ].filter((d) => d.value > 0);

  const glance = [
    { label: "Planned Deliveries", value: String(em.today.plannedDeliveries), delta: "+12%", dir: "up" as const },
    { label: "Planned Pickups", value: String(em.today.plannedPickups), delta: "+8%", dir: "up" as const },
    { label: "Planned Mixed (Del + Pick)", value: String(em.today.plannedMixed), delta: "+5%", dir: "up" as const },
    { label: "Total Stops", value: String(em.today.totalStops), delta: null, dir: null },
    { label: "Total Distance", value: `${em.today.totalDistanceKm.toLocaleString()} km`, delta: "−11%", dir: "down" as const },
    { label: "Total Duration", value: `${em.today.totalDurationH} hrs`, delta: "−9%", dir: "down" as const },
  ];

  const toggleMapLayer = (layer: "machines" | "branches") => {
    setMapLayers((prev) => {
      const next = { ...prev, [layer]: !prev[layer] };
      // Keep at least one layer on — empty map is never useful.
      if (!next.machines && !next.branches) return prev;
      return next;
    });
  };

  return (
    <div className="overview-page">
      {/* Header */}
      <div className="overview-toolbar">
        <div className="overview-filters">
          <div className="eo-filter">
            <MapPin size={14} />
            <span>Region</span>
            <span className="eo-filter-val">{config.params.region}</span>
          </div>
        </div>
        <div className="overview-actions">
          <DateFilter />
          <span className="eo-refresh">Source: Unity Catalog</span>
          <button type="button" className="btn sm ghost" disabled>
            <Filter size={14} /> Filters
          </button>
          <button type="button" className="icon-btn" aria-label="More" disabled>
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="eo-kpi-row">
        {dataLoading ? (
          Array.from({ length: 7 }).map((_, i) => <SkeletonKpiCard key={i} />)
        ) : (
          <>
            <KpiCard
              icon={<Banknote size={18} color={COLOR.accent} />}
              label="Total Cash Managed"
              value={thbB(em.totalCashManaged)}
              delta={{ text: "8%", dir: "up", good: true }}
              spark={[82, 85, 88, 90, 92, 95, 100]}
            />
            <KpiCard
              icon={<PiggyBank size={18} color={COLOR.amber} />}
              label="Idle Cash"
              value={thbB(em.idleCash)}
              delta={{ text: "15%", dir: "down", good: true }}
              tone="amber"
            />
            <KpiCard
              icon={<Truck size={18} color={COLOR.accent} />}
              label="CIT Cost (MTD)"
              value={thbB(em.citCostMtd)}
              delta={{ text: "10%", dir: "down", good: true }}
              compareLabel="vs last month"
            />
            <KpiCard
              icon={<TrendingDown size={18} color={COLOR.red} />}
              label="Cash Out Risk"
              value={`${em.serviceNeededMachines} Machines`}
              delta={{ text: "42%", dir: "up", good: false }}
              tone="danger"
              spark={[4, 6, 7, 9, 10, 11, em.serviceNeededMachines]}
            />
            <KpiCard
              icon={<Building2 size={18} color={COLOR.red} />}
              label="Branch Risk"
              value={`${em.branchRisk} Branches`}
              delta={{ text: "22%", dir: "up", good: false }}
              tone="danger"
              spark={[3, 4, 5, 6, 7, 8, em.branchRisk]}
            />
            <KpiCard
              icon={<CheckCircle2 size={18} color={COLOR.green} />}
              label="Route SLA"
              value={em.routeSla != null ? `${em.routeSla}%` : "—"}
              delta={em.routeSla != null ? { text: "2.1pp", dir: "up", good: true } : undefined}
              tone={em.routeSla != null ? "green" : undefined}
              spark={em.routeSla != null ? [94.2, 95.1, 95.8, 96.4, 97.2, 97.9, em.routeSla] : undefined}
            />
            <KpiCard
              icon={<Gauge size={18} color={COLOR.accent} />}
              label="Vehicle Utilization"
              value={`${em.vehicleUtilization}%`}
              delta={{ text: "5.4pp", dir: "up", good: true }}
              spark={em.utilization24h.map((d) => d.pct)}
            />
          </>
        )}
      </div>

      {/* Map and Overview Panels */}
      <div className="overview-main">
        <div className="panel overview-map-panel">
          <div className="panel-head">
            <h2>Cash Health Map (Machines &amp; Branches)</h2>
            <span className="hint">{visibleCount} shown</span>
          </div>
          <div className="overview-map-wrap">
            {dataLoading ? (
              <Skeleton height="100%" radius={0} style={{ minHeight: 440 }} />
            ) : (
              <>
                <div className="eo-map-viewby" role="group" aria-label="Map layers">
                  <span className="eo-map-viewby-label">View by</span>
                  <span className="eo-map-viewby-hint">Select one or both</span>
                  <div className="eo-map-viewby-btns">
                    <button
                      type="button"
                      className={`eo-toggle eo-layer-toggle ${mapLayers.machines ? "on" : ""}`}
                      onClick={() => toggleMapLayer("machines")}
                      aria-pressed={mapLayers.machines}
                    >
                      <span className={`eo-layer-check ${mapLayers.machines ? "checked" : ""}`} aria-hidden>
                        {mapLayers.machines ? "✓" : ""}
                      </span>
                      <span className="eo-layer-swatch machine" aria-hidden />
                      Machines
                      <span className="eo-layer-count">{machineCount}</span>
                    </button>
                    <button
                      type="button"
                      className={`eo-toggle eo-layer-toggle ${mapLayers.branches ? "on" : ""}`}
                      onClick={() => toggleMapLayer("branches")}
                      aria-pressed={mapLayers.branches}
                    >
                      <span className={`eo-layer-check ${mapLayers.branches ? "checked" : ""}`} aria-hidden>
                        {mapLayers.branches ? "✓" : ""}
                      </span>
                      <span className="eo-layer-swatch branch" aria-hidden />
                      Branches
                      <span className="eo-layer-count">{branchCount}</span>
                    </button>
                  </div>
                </div>
                <HealthMap points={visibleMapPoints} showKindLegend />
              </>
            )}
          </div>
        </div>

        <div className="panel overview-glance">
          <div className="panel-head">
            <h2>Today At A Glance</h2>
          </div>
          <div className="panel-body eo-glance-list">
            {dataLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                <div className="eo-glance-row" key={i}>
                  <Skeleton width="55%" height={16} />
                  <Skeleton width={50} height={12} />
                </div>
              ))
              : glance.map((g) => (
                <div className="eo-glance-row" key={g.label}>
                  <span className="eo-glance-label">{g.label}</span>
                  <span className="eo-glance-val">
                    {g.value}
                    {g.delta && (
                      // Decreases are always red (ops signal), increases green —
                      // independent of whether the change is "good" for cost.
                      <span
                        className={g.dir === "down" ? "decrease" : "increase"}
                        style={{ marginLeft: 8, fontSize: 11 }}
                      >
                        {g.delta}
                      </span>
                    )}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="panel overview-routes">
          <div className="panel-head">
            <h2>Route Status</h2>
          </div>
          <div className="panel-body eo-route-donut">
            {dataLoading ? (
              <>
                <div className="eo-donut-side">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div className="eo-status-row" key={i}>
                      <Skeleton width={9} height={9} radius={99} />
                      <Skeleton width={70} height={11} />
                    </div>
                  ))}
                </div>
                <Skeleton width={140} height={140} radius={999} />
              </>
            ) : (
              <>
                <div className="eo-donut-side">
                  {donut.map((d) => (
                    <div className="eo-status-row" key={d.name}>
                      <StatusDot color={d.color} />
                      <span>{d.name}</span>
                      <span className="eo-status-pct">
                        {em.routeStatus.total ? Math.round((d.value / em.routeStatus.total) * 1000) / 10 : 0}%
                      </span>
                    </div>
                  ))}
                </div>
                <div className="eo-donut-chart">
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={donut} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="none">
                        {donut.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="eo-donut-center">
                    <strong>{em.routeStatus.total}</strong>
                    <span>Total Routes</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="panel overview-risk">
          <div className="panel-head">
            <h2>Cash Out Risk (Top 10 Machines)</h2>
          </div>
          <div className="panel-body" style={{ padding: 0, overflowX: "auto" }}>
            <table className="branch-table eo-risk-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Location</th>
                  <th className="num">Predicted Cash</th>
                  <th>Risk</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {dataLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td><Skeleton width={60} height={11} /></td>
                      <td><Skeleton width="70%" height={11} /></td>
                      <td className="num"><Skeleton width={70} height={11} style={{ marginLeft: "auto" }} /></td>
                      <td><Skeleton width={54} height={18} radius={999} /></td>
                      <td><Skeleton width={80} height={20} radius={6} /></td>
                    </tr>
                  ))
                  : em.topCashOutRisk.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600 }}>{m.id}</td>
                      <td>{m.location}</td>
                      <td className="num">{thb(m.predictedCash)}</td>
                      <td>
                        <Pill color={RISK_COLOR[m.risk]}>{m.risk}</Pill>
                      </td>
                      <td>
                        <button type="button" className="eo-action-btn" disabled={m.action == 'No Action'}>{m.action}</button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel overview-util">
          <div className="panel-head">
            <h2>Vehicle Utilization</h2>
            <span className="hint">24h trend</span>
          </div>
          <div className="panel-body">
            {dataLoading ? (
              <Skeleton height={220} radius={10} />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={em.utilization24h} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border-soft)" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickMargin={8} />
                  <YAxis domain={[0, 100]} tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={32} tickFormatter={(v) => `${v}%`} tickMargin={8} />
                  <Tooltip
                    contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [`${v}%`, "Utilization"]}
                  />
                  <Line type="monotone" dataKey="pct" stroke={COLOR.accent} strokeWidth={2.5} dot={{ r: 3, fill: COLOR.accent }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
