import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { buildAiPerformance } from "@/domain/aiPerformance";
import { useAppData } from "@/hooks/useAppData";
import StatusDot from "@/components/StatusDot";
import Skeleton from "@/components/Skeleton";
import AccuracyGauge from "./_AccuracyGauge";

export default function AiPerformancePage() {
  const { plan, dataLoading } = useAppData();
  const ap = useMemo(() => buildAiPerformance(plan.metrics), [plan.metrics]);
  const maxBenefit = Math.max(...ap.benefits.map((b) => b.valueThb));

  return (
    <div className="ai-page">
      <div className="ai-grid">
        {/* Prediction accuracy */}
        <div className="panel">
          <div className="panel-head">
            <h2>Prediction Accuracy (MAPE)</h2>
            <span className="hint">lower is better</span>
          </div>
          <div className="panel-body ai-gauges">
            {dataLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                <div className="ai-gauge" key={i}>
                  <Skeleton width={70} height={11} />
                  <Skeleton width={110} height={110} radius={999} />
                </div>
              ))
              : ap.accuracy.map((r) => (
                <AccuracyGauge key={r.label} ring={r} />
              ))}
          </div>
        </div>

        {/* Recommendation acceptance */}
        <div className="panel">
          <div className="panel-head">
            <h2>Recommendation Acceptance</h2>
          </div>
          <div className="panel-body ai-acceptance">
            {dataLoading ? (
              <>
                <div className="ai-donut" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 190 }}>
                  <Skeleton width="auto" height={"80%"} radius={999} style={{ maxWidth: "100%", aspectRatio: 1 }} />
                </div>
                <div className="ai-acceptance-legend">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div className="ai-legend-row" key={i}>
                      <Skeleton width={9} height={9} radius={99} />
                      <Skeleton width={80} height={12} />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="ai-donut">
                  <ResponsiveContainer width="100%" height={190}>
                    <PieChart>
                      <Pie
                        data={ap.acceptance}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="66%"
                        outerRadius="92%"
                        paddingAngle={2}
                        stroke="none"
                      >
                        {ap.acceptance.map((s) => (
                          <Cell key={s.name} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                        formatter={(v: number, n: string) => [`${v}%`, n]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="ai-donut-center">
                    <strong>{ap.acceptanceRate}%</strong>
                    <span>Accepted</span>
                  </div>
                </div>
                <div className="ai-acceptance-legend">
                  {ap.acceptance.map((s) => (
                    <div className="ai-legend-row" key={s.name}>
                      <StatusDot color={s.color} />
                      <span className="ai-legend-name">{s.name}</span>
                      <span className="ai-legend-val">{s.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Forecast vs actual */}
        <div className="panel">
          <div className="panel-head">
            <h2>Forecast vs Actual (Overall)</h2>
            <span className="hint">daily net cash demand · THB M</span>
          </div>
          <div className="panel-body">
            {dataLoading ? (
              <Skeleton height={250} radius={10} />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={ap.forecast} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border-soft)" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip
                    contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="actual" name="Actual" stroke="#1d4ed8" strokeWidth={2.5} dot={{ r: 3, fill: "#1d4ed8" }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#60a5fa" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3, fill: "#60a5fa" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Estimated annual benefit */}
        <div className="panel">
          <div className="panel-head">
            <h2>Estimated Annual Benefit</h2>
          </div>
          <div className="panel-body ai-benefits">
            {dataLoading ? (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div className="ai-benefit-row" key={i}>
                    <Skeleton width="70%" height={12} />
                    <Skeleton height={14} radius={999} />
                    <Skeleton width={80} height={12} style={{ marginLeft: "auto" }} />
                  </div>
                ))}
                <div className="ai-total-row">
                  <Skeleton width={160} height={12} />
                  <Skeleton width={90} height={14} />
                </div>
              </>
            ) : (
              <>
                {ap.benefits.map((b) => (
                  <div className="ai-benefit-row" key={b.label}>
                    <span className="ai-benefit-label">{b.label}</span>
                    <div className="ai-benefit-track">
                      <div
                        className="ai-benefit-fill"
                        style={{ width: `${(b.valueThb / maxBenefit) * 100}%`, background: b.color }}
                      />
                    </div>
                    <span className="ai-benefit-val">THB {b.valueThb.toFixed(1)}M</span>
                  </div>
                ))}
                <div className="ai-total-row">
                  <span>TOTAL ESTIMATED BENEFIT</span>
                  <strong>THB {ap.totalBenefit.toFixed(1)}M</strong>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
