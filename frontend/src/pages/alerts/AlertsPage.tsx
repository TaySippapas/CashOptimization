import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
} from "recharts";
import { AlertTriangle, ChevronRight, Filter } from "lucide-react";
import { buildAlerts, IMPACT_STYLE, STATUS_STYLE, type AlertType, type AlertImpact, type AlertStatus } from "@/domain/alertsData";
import { useAppData } from "@/hooks/useAppData";
import StatusDot from "@/components/StatusDot";
import Pill from "@/components/Pill";
import KpiCard, { SkeletonKpiCard } from "@/components/KpiCard";
import Skeleton from "@/components/Skeleton";
import { COLOR } from "@/utils/colors";

const IMPACT_OPTIONS: AlertImpact[] = ["Critical", "High", "Medium", "Low"];
const STATUS_OPTIONS: AlertStatus[] = ["New", "In Progress", "Acknowledged"];
const ALL = "All";

export default function AlertsPage() {
  const { config, execs, dataLoading } = useAppData();
  const [showAll, setShowAll] = useState(false);
  const [typeFilter, setTypeFilter] = useState<AlertType | typeof ALL>(ALL);
  const [impactFilter, setImpactFilter] = useState<AlertImpact | typeof ALL>(ALL);
  const [statusFilter, setStatusFilter] = useState<AlertStatus | typeof ALL>(ALL);
  const summary = useMemo(() => buildAlerts(config, execs), [config, execs]);
  const total = summary.byType.reduce((s, d) => s + d.value, 0);

  const filtered = useMemo(
    () =>
      summary.alerts.filter(
        (a) =>
          (typeFilter === ALL || a.type === typeFilter) &&
          (impactFilter === ALL || a.impact === impactFilter) &&
          (statusFilter === ALL || a.status === statusFilter)
      ),
    [summary.alerts, typeFilter, impactFilter, statusFilter]
  );
  const visible = showAll ? filtered : filtered.slice(0, 12);
  const filtersActive = typeFilter !== ALL || impactFilter !== ALL || statusFilter !== ALL;

  return (
    <div className="alerts-page">
      <div className="alert-kpi-row">
        {dataLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonKpiCard key={i} />)
        ) : (
          <>
            <KpiCard icon={<AlertTriangle size={20} color={COLOR.red} />} label="Critical Alerts" value={String(summary.critical)} tone="danger" />
            <KpiCard icon={<AlertTriangle size={20} color={COLOR.orange} />} label="High Alerts" value={String(summary.high)} tone="amber" />
            <KpiCard icon={<AlertTriangle size={20} color={COLOR.gold} />} label="Medium Alerts" value={String(summary.medium)} tone="amber" />
            <KpiCard icon={<AlertTriangle size={20} color={COLOR.accent} />} label="Total Alerts" value={String(summary.total)} />
          </>
        )}
      </div>

      <div className="alerts-split">
        <div className="alerts-list-panel panel">
          <div className="panel-head">
            <h2>Alert List</h2>
            <span className="hint">
              {filtered.length} of {summary.total} {filtersActive ? "matching" : "open"}
            </span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            {/* Filter Table */}
            <div className="alerts-filter-row">
              <span style={{ width: 'auto' }}>
                <Filter size={14} />
              </span>
              <select className="select-inline" style={{ width: '100%' }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as AlertType | typeof ALL)}>
                <option value={ALL}>All Types</option>
                {summary.byType.map((d) => (
                  <option key={d.name} value={d.name}>{d.name}</option>
                ))}
              </select>
              <select className="select-inline" style={{ width: '100%' }} value={impactFilter} onChange={(e) => setImpactFilter(e.target.value as AlertImpact | typeof ALL)}>
                <option value={ALL}>All Impact</option>
                {IMPACT_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <select className="select-inline" style={{ width: '100%' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AlertStatus | typeof ALL)}>
                <option value={ALL}>All Status</option>
                {STATUS_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => {
                  setTypeFilter(ALL);
                  setImpactFilter(ALL);
                  setStatusFilter(ALL);
                }}
                disabled={!filtersActive}
              >
                Clear
              </button>
            </div>
            <table className="alerts-table branch-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Entity</th>
                  <th>Description</th>
                  <th>Impact</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dataLoading &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td className="al-time"><Skeleton width={40} height={11} /></td>
                      <td><Skeleton width={60} height={11} /></td>
                      <td><Skeleton width={70} height={12} /></td>
                      <td className="al-desc"><Skeleton width="80%" height={11} /></td>
                      <td><Skeleton width={54} height={18} radius={999} /></td>
                      <td><Skeleton width={70} height={18} radius={999} /></td>
                    </tr>
                  ))}
                {!dataLoading &&
                  visible.map((a) => (
                    <tr key={a.id}>
                      <td className="al-time">{a.time}</td>
                      <td>{a.type}</td>
                      <td style={{ fontWeight: 600 }}>{a.entity}</td>
                      <td className="al-desc">{a.description}</td>
                      <td>
                        <Pill color={IMPACT_STYLE[a.impact]}>{a.impact}</Pill>
                      </td>
                      <td>
                        <Pill color={STATUS_STYLE[a.status]}>{a.status}</Pill>
                      </td>
                    </tr>
                  ))}
                {!dataLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: "24px 0" }}>
                      No alerts match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {!showAll && filtered.length > 12 && (
              <button type="button" className="alerts-view-all" onClick={() => setShowAll(true)}>
                View All Alerts <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="alerts-charts">
          <div className="panel">
            <div className="panel-head">
              <h2>Alerts by Type</h2>
            </div>
            <div className="panel-body alerts-type-chart">
              {dataLoading ? (
                <>
                  <div className="alerts-type-legend">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div className="al-type-row" key={i}>
                        <Skeleton width={9} height={9} radius={99} />
                        <Skeleton width={70} height={11} />
                      </div>
                    ))}
                  </div>
                  <div className="alerts-donut-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
                    <Skeleton width={160} height={160} radius={999} />
                  </div>
                </>
              ) : (
                <>
                  <div className="alerts-type-legend">
                    {summary.byType.map((d) => (
                      <div className="al-type-row" key={d.name}>
                        <StatusDot color={d.color} />
                        <span>{d.name}</span>
                        <span className="al-type-val">
                          {d.value} ({total ? Math.round((d.value / total) * 1000) / 10 : 0}%)
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="alerts-donut-wrap">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={summary.byType}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="58%"
                          outerRadius="88%"
                          paddingAngle={2}
                          stroke="none"
                        >
                          {summary.byType.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Alerts by Impact</h2>
              <span className="hint">Critical · High · Medium · Low</span>
            </div>
            <div className="panel-body">
              {dataLoading ? (
                <Skeleton height={220} radius={10} />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={summary.byImpact} layout="vertical" margin={{ top: 4, right: 36, left: 4, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: "var(--muted)", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={72}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(0,0,0,0.45)" }}
                      contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                      {summary.byImpact.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                      <LabelList dataKey="value" position="right" fill="var(--text)" fontSize={12} fontWeight={700} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
