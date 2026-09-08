import { apiFetch } from "@/api/client";
import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  PiggyBank,
  Truck,
  Wrench,
  CheckCircle2,
  Gauge,
  Calendar,
  MapPin,
  BarChart3,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { thb, thbB } from "@/utils/format";
import { dailyComparison } from "@/domain/dailyComparison";
import HealthMap, { type MapPoint } from "@/components/maps/HealthMap";
import { useAppData } from "@/hooks/useAppData";
import KpiCard, { SkeletonKpiCard } from "@/components/KpiCard";
import StatusDot from "@/components/StatusDot";
import Pill from "@/components/Pill";
import Skeleton from "@/components/Skeleton";
import DateFilter from "@/components/DateFilter";
import PeriodFilter, { type Period } from "./_PeriodFilter";
import { COLOR } from "@/utils/colors";

const API = "/api/v2";

interface OverviewData {
  source: string;
  demand: {
    branch: { total: number; needService: number; deliveryAmount: number; totalActualCash: number; businessDate: string };
    machine: { total: number; needService: number; serviceBreakdown: { action: string; count: number }[]; totalActualCash: number; businessDate: string };
  };
  plan: {
    trucks: number; totalStops: number; totalDistanceKm: number; totalDurationMinutes: number;
    avgDurationMinutes: number; maxDurationMinutes: number; otTrucks: number;
    deliveryAmountBranch: number; deliveryAmountMachine: number;
    avgUtilizationPct: number; avgSlaPct: number;
    stopsByType: Record<string, { count: number; distinct: number }>;
    businessDate: string;
  };
  coverage: {
    branch: { demand: number; planned: number; covered: number; unserved: number; extra: number };
    machine: { demand: number; planned: number; covered: number; unserved: number; extra: number };
  };
  cost: { cot: number; cof: number | null; citTotal: number };
  cashUnderManagement: number;
  period: Period;
  periodDays: number;
  periodStart: string;
  periodEnd: string;
}

const STATUS_COLOR: Record<string, string> = {
  "On Track": COLOR.green,
  Delayed: COLOR.amber,
  "At Risk": COLOR.red,
};

/** Each period is read against the next-longer window it sits inside: a day
 *  against its week, a week against its month, and so on. The longest window
 *  has nothing to sit inside, so it gets no comparison. */
const BASELINE: Record<Period, Period | null> = {
  day: "week",
  week: "month",
  month: "quarter",
  quarter: "year",
  year: null,
};

const PERIOD_LABEL: Record<Period, string> = {
  day: "1D", week: "1W", month: "1M", quarter: "3M", year: "1Y",
};

/** The tracking pages' delta formatting, reused so a percentage reads the same
 *  everywhere. Only the baseline differs — a longer window here rather than the
 *  same day last week — so its date-derived label is dropped and the caller
 *  passes the period label to KpiCard instead. Counts and amounts compare in
 *  percent; rates already on a 0–100 scale compare in points. */
function periodDelta(current: number, baseline: number, unit: "%" | "pp", better?: "higher" | "lower") {
  return dailyComparison(current, baseline, "", { unit, better }).delta;
}

function fmtHours(min: number): string {
  if (!min) return "\u2014";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

export default function ExecutiveOverviewV2Page() {
  const { execs, routeSummary, machinesOverride, branchTracksOverride, dataLoading, selectedDate } = useAppData();
  const [ov, setOv] = useState<OverviewData | null>(null);
  const [base, setBase] = useState<OverviewData | null>(null);
  const [ovLoading, setOvLoading] = useState(true);
  const [ovError, setOvError] = useState<string | null>(null);
  const [mapLayers, setMapLayers] = useState({ machines: true, branches: true });
  const [period, setPeriod] = useState<Period>("day");

  useEffect(() => {
    let cancelled = false;
    setOvLoading(true);
    setOvError(null);
    const load = async (p: Period) => {
      const params = new URLSearchParams({ period: p });
      if (selectedDate) params.set("date", selectedDate);
      const res = await apiFetch(`${API}/overview-summary?${params}`);
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      return res.json();
    };
    (async () => {
      try {
        const basePeriod = BASELINE[period];
        // Fetched alongside, not after, so a tile and its delta appear together
        // instead of the cards growing a beat later. A baseline that fails just
        // costs the deltas — it must never take the page down with it.
        const [r, b] = await Promise.all([
          load(period),
          basePeriod ? load(basePeriod).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (r.error) setOvError(r.error);
        else setOv(r as OverviewData);
        setBase(b && !b.error ? (b as OverviewData) : null);
      } catch (e: any) {
        if (!cancelled) setOvError(e?.message ?? "Network error");
      } finally {
        if (!cancelled) setOvLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, period]);

  const loading = dataLoading || ovLoading;
  const machines = useMemo(() => machinesOverride ?? [], [machinesOverride]);
  const branches = useMemo(() => branchTracksOverride ?? [], [branchTracksOverride]);

  // Over a multi-day window some tiles are per-day averages and others are
  // period totals; without saying which, the numbers can't be read correctly.
  const multiDay = period !== "day";
  const avgTag = multiDay ? "avg/day" : undefined;
  const totalTag = multiDay ? `total · ${period === "quarter" ? "3M" : period === "week" ? "1W" : period === "month" ? "1M" : "1Y"}` : undefined;

  // Every tile is compared with the same figure over the next-longer window.
  // Period totals are reduced to a daily rate on both sides first, so one day
  // is measured against the baseline's average day rather than its whole total
  // (which would read as -86% every time). Stocks and rates already arrive from
  // the API as per-day averages, so those compare directly.
  const baselinePeriod = BASELINE[period];
  const compareLabel = baselinePeriod ? `vs ${PERIOD_LABEL[baselinePeriod]} avg` : undefined;
  const deltas = useMemo(() => {
    if (!ov || !base) return null;
    const perDay = (value: number, d: OverviewData) => value / Math.max(d.periodDays, 1);
    const servicePointsOf = (d: OverviewData) => d.demand.branch.needService + d.demand.machine.needService;
    return {
      cash: periodDelta(ov.cashUnderManagement, base.cashUnderManagement, "%"),
      cit: periodDelta(perDay(ov.cost.citTotal, ov), perDay(base.cost.citTotal, base), "%", "lower"),
      service: periodDelta(servicePointsOf(ov), servicePointsOf(base), "%"),
      sla: periodDelta(ov.plan.avgSlaPct, base.plan.avgSlaPct, "pp", "higher"),
      util: periodDelta(ov.plan.avgUtilizationPct, base.plan.avgUtilizationPct, "pp", "higher"),
    };
  }, [ov, base]);

  // Route status donut
  const donut = useMemo(() => [
    { name: "On Track", value: routeSummary.onTrack, color: STATUS_COLOR["On Track"] },
    { name: "Delayed", value: routeSummary.delayed, color: STATUS_COLOR.Delayed },
    { name: "At Risk", value: routeSummary.atRisk, color: STATUS_COLOR["At Risk"] },
  ].filter((d) => d.value > 0), [routeSummary]);

  // Map points
  const machinePoints = useMemo<MapPoint[]>(
    () => machines.map((m) => ({
      id: `machine-${m.id}`, kind: "machine" as const,
      lat: m.lat, lng: m.lng, health: m.health,
      title: `${m.id} \u00b7 ${m.location}`,
      rows: [["Type", "Machine"], ["Current", thb(m.currentCash)], ["Predicted EOD", thb(m.predictedEod)], ["Action", m.action]],
    })),
    [machines]
  );
  const branchPoints = useMemo<MapPoint[]>(
    () => branches.map((b) => ({
      id: `branch-${b.code}`, kind: "branch" as const,
      lat: b.lat, lng: b.lng, health: b.health, emphasize: b.emergency,
      title: `${b.name} \u00b7 ${b.code}`,
      rows: [["Type", "Branch"], ["Current cash", thb(b.currentCash)], ["Deposit", thb(b.deposit)], ["Withdraw", thb(b.withdraw)], ["Action", b.action]],
    })),
    [branches]
  );
  const visibleMapPoints = useMemo(() => {
    const pts: MapPoint[] = [];
    if (mapLayers.machines) pts.push(...machinePoints);
    if (mapLayers.branches) pts.push(...branchPoints);
    return pts;
  }, [mapLayers, machinePoints, branchPoints]);

  const toggleMapLayer = (layer: "machines" | "branches") => {
    setMapLayers((prev) => {
      const next = { ...prev, [layer]: !prev[layer] };
      if (!next.machines && !next.branches) return prev;
      return next;
    });
  };

  // Demand vs Plan numbers
  const servicePoints = ov ? (ov.demand.branch.needService + ov.demand.machine.needService) : 0;
  const planStopsBranch = ov?.plan.stopsByType["Branch"]?.count ?? 0;
  const planStopsMachine = (ov?.plan.stopsByType["ATM"]?.count ?? 0) + (ov?.plan.stopsByType["RCM"]?.count ?? 0) + (ov?.plan.stopsByType["3IN1"]?.count ?? 0);
  const planStopsOther = ov?.plan.stopsByType["Other Bank"]?.count ?? 0;

  // CIT cost chart data (single day for now, future: multi-day)
  const citChartData = ov ? [
    { name: ov.plan.businessDate || "Today", CoT: Math.round(ov.cost.cot), CoF: ov.cost.cof ?? 0 },
  ] : [];

  // Machine attention (service needed)
  const machineAttention = useMemo(
    () => machines.filter((m) => m.action !== "No Action").sort((a, b) => a.action.localeCompare(b.action)),
    [machines]
  );

  // Branch service (action = Deliver or Both)
  const branchService = useMemo(
    () => branches.filter((b) => b.action !== "No Action").sort((a, b) => b.currentCash - a.currentCash),
    [branches]
  );

  // Glance items (from overview-summary + route)
  const glance = ov ? [
    { label: "Vehicles Deployed", value: `${ov.plan.trucks}` },
    { label: "Total Stops", value: `${ov.plan.totalStops}` },
    { label: "Total Distance", value: `${ov.plan.totalDistanceKm.toLocaleString()} km` },
    { label: "Avg Duration / Truck", value: fmtHours(ov.plan.avgDurationMinutes), sub: `${ov.plan.otTrucks} of ${ov.plan.trucks} trucks > 8 hrs` },
    { label: "Longest Route", value: fmtHours(ov.plan.maxDurationMinutes) },
    { label: "Branch Stops", value: `${planStopsBranch}` },
    { label: "Machine Stops", value: `${planStopsMachine}` },
    { label: "Other Bank Stops", value: `${planStopsOther}` },
    { label: "Delivery Amount", value: thb(ov.plan.deliveryAmountBranch + ov.plan.deliveryAmountMachine) },
  ] : [];

  return (
    <div className="overview-page">
      {/* Header */}
      <div className="overview-toolbar">
        <div className="overview-filters">
          {ov && (
            <>
              <div className="eo-filter">
                <Calendar size={14} />
                <span>Route</span>
                <span className="eo-filter-val">{ov.plan.businessDate || "—"}</span>
              </div>
              <div className="eo-filter">
                <MapPin size={14} />
                <span>Branch</span>
                <span className="eo-filter-val">{ov.demand.branch.businessDate || "—"}</span>
              </div>
              <div className="eo-filter">
                <MapPin size={14} />
                <span>Machine</span>
                <span className="eo-filter-val">{ov.demand.machine.businessDate || "—"}</span>
              </div>
            </>
          )}
        </div>
        <div className="overview-actions">
          <PeriodFilter value={period} onChange={setPeriod} disabled={ovLoading} />
          {ov && period !== "day" && (
            <span className="period-range">
              {ov.periodStart} → {ov.periodEnd}
            </span>
          )}
          <DateFilter />
          <span className="eo-refresh">Source: Unity Catalog</span>
        </div>
      </div>

      {/* Error banner */}
      {ovError && (
        <div style={{ padding: "10px 16px", marginBottom: 12, borderRadius: 8, background: "rgba(239,68,68,0.15)", border: "1px solid #ef4444", color: "#fca5a5", fontSize: 12 }}>
          ⚠️ Overview: {ovError}
        </div>
      )}

      {/* KPI Row */}
      <div className="eo-kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, width: "100%" }}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonKpiCard key={i} />)
        ) : (
          <>
            <KpiCard
              icon={<Banknote size={18} color={COLOR.accent} />}
              label="Total Cash Under Management"
              value={ov ? thbB(ov.cashUnderManagement) : "—"}
              qualifier={avgTag}
              delta={deltas?.cash}
              compareLabel={compareLabel}
              sub={ov ? `${ov.demand.branch.total} branches · ${ov.demand.machine.total} machines` : undefined}
            />
            <KpiCard
              icon={<PiggyBank size={18} color={COLOR.amber} />}
              label="Idle Cash"
              value="—"
              sub="Pending Cost of Fund model"
              tone="amber"
            />
            <KpiCard
              icon={<Truck size={18} color={COLOR.accent} />}
              label="CIT Cost"
              value={ov ? thb(ov.cost.citTotal) : "—"}
              qualifier={totalTag}
              delta={deltas?.cit}
              compareLabel={compareLabel}
              sub={ov ? `CoT ${thb(ov.cost.cot)} · CoF ${ov.cost.cof != null ? thb(ov.cost.cof) : "—"}` : undefined}
            />
            <KpiCard
              icon={<Wrench size={18} color={COLOR.red} />}
              label="Service Points (Demand)"
              value={ov ? `${servicePoints} points` : "—"}
              qualifier={avgTag}
              delta={deltas?.service}
              compareLabel={compareLabel}
              sub={ov ? `${ov.demand.branch.needService} Br · ${ov.demand.machine.needService} Machine` : undefined}
              tone="danger"
            />
            <KpiCard
              icon={<CheckCircle2 size={18} color={COLOR.green} />}
              label="Route SLA"
              value={ov ? `${ov.plan.avgSlaPct}%` : "—"}
              qualifier={avgTag}
              delta={deltas?.sla}
              compareLabel={compareLabel}
              tone="green"
            />
            <KpiCard
              icon={<Gauge size={18} color={COLOR.accent} />}
              label="Vehicle Utilization"
              value={ov ? `${ov.plan.avgUtilizationPct}%` : "—"}
              qualifier={avgTag}
              delta={deltas?.util}
              compareLabel={compareLabel}
            />
          </>
        )}
      </div>

      {/* Main panels */}
      <div className="overview-main">
        {/* Map */}
        <div className="panel overview-map-panel">
          <div className="panel-head">
            <h2>Cash Health Map</h2>
            <span className="hint">{visibleMapPoints.length} shown</span>
          </div>
          <div className="overview-map-wrap">
            {loading ? (
              <Skeleton height="100%" radius={0} style={{ minHeight: 440 }} />
            ) : (
              <>
                <div className="eo-map-viewby" role="group" aria-label="Map layers">
                  <span className="eo-map-viewby-label">View by</span>
                  <div className="eo-map-viewby-btns">
                    <button type="button" className={`eo-toggle eo-layer-toggle ${mapLayers.machines ? "on" : ""}`} onClick={() => toggleMapLayer("machines")} aria-pressed={mapLayers.machines}>
                      <span className={`eo-layer-check ${mapLayers.machines ? "checked" : ""}`} aria-hidden>{mapLayers.machines ? "\u2713" : ""}</span>
                      <span className="eo-layer-swatch machine" aria-hidden />
                      Machines <span className="eo-layer-count">{machinePoints.length}</span>
                    </button>
                    <button type="button" className={`eo-toggle eo-layer-toggle ${mapLayers.branches ? "on" : ""}`} onClick={() => toggleMapLayer("branches")} aria-pressed={mapLayers.branches}>
                      <span className={`eo-layer-check ${mapLayers.branches ? "checked" : ""}`} aria-hidden>{mapLayers.branches ? "\u2713" : ""}</span>
                      <span className="eo-layer-swatch branch" aria-hidden />
                      Branches <span className="eo-layer-count">{branchPoints.length}</span>
                    </button>
                  </div>
                </div>
                <HealthMap points={visibleMapPoints} showKindLegend />
              </>
            )}
          </div>
        </div>

        {/* Today at a Glance + Demand vs Plan */}
        <div className="panel overview-glance">
          <div className="panel-head">
            <h2>Demand vs Plan</h2>
          </div>
          <div className="panel-body eo-glance-list">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                <div className="eo-glance-row" key={i}><Skeleton width="55%" height={16} /><Skeleton width={50} height={12} /></div>
              ))
              : glance.map((g) => (
                <div className="eo-glance-row" key={g.label}>
                  <span className="eo-glance-label">{g.label}</span>
                  <span className="eo-glance-val">
                    {g.value}
                    {g.sub && <span style={{ display: "block", fontSize: 9, color: "var(--muted)", fontWeight: 400 }}>{g.sub}</span>}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Route Status Donut */}
        <div className="panel overview-routes">
          <div className="panel-head">
            <h2>Route Status</h2>
          </div>
          <div className="panel-body eo-route-donut">
            {loading ? (
              <><div className="eo-donut-side">{Array.from({ length: 3 }).map((_, i) => (<div className="eo-status-row" key={i}><Skeleton width={9} height={9} radius={99} /><Skeleton width={70} height={11} /></div>))}</div><Skeleton width={140} height={140} radius={999} /></>
            ) : (
              <>
                <div className="eo-donut-side">
                  {donut.map((d) => (
                    <div className="eo-status-row" key={d.name}>
                      <StatusDot color={d.color} />
                      <span>{d.name}</span>
                      <span className="eo-status-pct">{routeSummary.totalRoutes ? Math.round((d.value / routeSummary.totalRoutes) * 1000) / 10 : 0}%</span>
                    </div>
                  ))}
                </div>
                <div className="eo-donut-chart">
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart><Pie data={donut} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="none">{donut.map((d) => <Cell key={d.name} fill={d.color} />)}</Pie></PieChart>
                  </ResponsiveContainer>
                  <div className="eo-donut-center"><strong>{routeSummary.totalRoutes}</strong><span>Total Routes</span></div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Machine Attention */}
        <div className="panel overview-risk">
          <div className="panel-head">
            <h2>Machine Attention</h2>
            <span className="hint">{machineAttention.length} need service</span>
          </div>
          <div className="panel-body" style={{ padding: 0, overflow: "auto", maxHeight: "clamp(240px, 42vh, 440px)" }}>
            <table className="branch-table eo-risk-table" style={{ fontSize: 12 }}>
              <thead><tr><th>Machine</th><th>Location</th><th className="num">Actual Cash</th><th className="num">Predicted</th><th>Action</th></tr></thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (<tr key={i}><td><Skeleton width={60} height={11} /></td><td><Skeleton width="70%" height={11} /></td><td className="num"><Skeleton width={70} height={11} /></td><td className="num"><Skeleton width={70} height={11} /></td><td><Skeleton width={80} height={20} radius={6} /></td></tr>))
                  : machineAttention.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600 }}>{m.id}</td>
                      <td>{m.location}</td>
                      <td className="num">{thb(m.currentCash)}</td>
                      <td className="num">{thb(m.predictedEod)}</td>
                      <td><Pill color={m.removeAmount > m.addAmount ? COLOR.amber : COLOR.red}>
                        {m.removeAmount > m.addAmount ? "Swap (Near Full)" : "Swap (Near Empty)"}
                      </Pill></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Demand Coverage */}
        <div className="panel" style={{ gridRow: 3, gridColumn: "3" }}>
          <div className="panel-head">
            <h2>Demand Coverage</h2>
            <span className="hint">Prediction vs Route Plan</span>
          </div>
          <div className="panel-body">
            {loading ? (
              <Skeleton height={160} radius={10} />
            ) : ov ? (
              <>
                <table className="branch-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Domain</th>
                      <th className="num">Demand</th>
                      <th className="num">In Plan</th>
                      <th className="num">Covered</th>
                      <th className="num">Unserved</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Branch</td>
                      <td className="num">{ov.coverage.branch.demand}</td>
                      <td className="num">{ov.coverage.branch.planned}</td>
                      <td className="num" style={{ color: COLOR.green, fontWeight: 600 }}>{ov.coverage.branch.covered}</td>
                      <td className="num" style={{ color: ov.coverage.branch.unserved > 0 ? COLOR.amber : "inherit" }}>{ov.coverage.branch.unserved}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Machine</td>
                      <td className="num">{ov.coverage.machine.demand}</td>
                      <td className="num">{ov.coverage.machine.planned}</td>
                      <td className="num" style={{ color: COLOR.green, fontWeight: 600 }}>{ov.coverage.machine.covered}</td>
                      <td className="num" style={{ color: ov.coverage.machine.unserved > 0 ? COLOR.amber : "inherit" }}>{ov.coverage.machine.unserved}</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 10 }}>
                  Demand = predicted service needs · In Plan = route stops · Covered = matched · Unserved = demand not in plan
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 13 }}>No data</div>
            )}
          </div>
        </div>

        {/* CIT Cost Trend */}
        <div className="panel" style={{ gridRow: 3, gridColumn: "1 / 3" }}>
          <div className="panel-head">
            <h2>CIT Cost Trend</h2>
            <span className="hint">Daily (multi-day when data flows)</span>
          </div>
          <div className="panel-body">
            {loading ? (
              <Skeleton height={220} radius={10} />
            ) : citChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={citChartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border-soft)" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => `฿${(v/1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [thb(v)]} />
                  <Bar dataKey="CoT" fill={COLOR.accent} radius={[4, 4, 0, 0]} name="Cost of Transport" />
                  <Bar dataKey="CoF" fill={COLOR.amber} radius={[4, 4, 0, 0]} name="Cost of Fund" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 13 }}>No cost data available</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
