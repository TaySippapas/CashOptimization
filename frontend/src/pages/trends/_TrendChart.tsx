import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendData, TrendMetric } from "@/domain/trends";
import { trendDate, trendValue } from "@/utils/trends";
import { COLOR } from "@/utils/colors";

const palette = [COLOR.accent, COLOR.purple, COLOR.amber, COLOR.green, COLOR.orange, COLOR.blue, COLOR.slate];

export default function TrendChart({ group, metrics, points }: { group: string; metrics: TrendMetric[]; points: TrendData["points"] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const unit = metrics[0].unit;
  const visible = metrics.filter((metric) => !hidden.includes(metric.key));
  const hasValues = points.some((point) => visible.some((metric) => point[metric.key] !== null));
  return <section className="trend-chart-card" aria-label={`${group} daily chart`}>
    <div className="trend-chart-heading"><h2>{group}</h2><span>Daily · {unit === "count" ? "Count" : unit}</span></div>
    <div className="trend-chart-canvas">
      {hasValues ? <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 12, right: 14, bottom: 0, left: 4 }} accessibilityLayer>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(value: string) => trendDate(value, false)} minTickGap={35} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis width={75} tickFormatter={(value: number) => trendValue(value, unit, true)} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip labelFormatter={(value) => trendDate(String(value))} formatter={(value: number) => trendValue(value, unit)} contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }} labelStyle={{ color: "var(--text)", marginBottom: 8 }} />
          {metrics.map((metric, index) => <Line key={metric.key} dataKey={metric.key} name={metric.label} hide={hidden.includes(metric.key)} stroke={palette[index % palette.length]} strokeWidth={2} type="linear" dot={{ r: points.length <= 7 ? 3 : 1 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer> : <p className="trend-chart-empty">{visible.length ? "No data in this range" : "Select a series below to show it"}</p>}
    </div>
    <div className="trend-chart-legend" aria-label={`${group} series`}>
      {metrics.map((metric, index) => <button key={metric.key} type="button" aria-pressed={!hidden.includes(metric.key)} onClick={() => setHidden((current) => current.includes(metric.key) ? current.filter((key) => key !== metric.key) : [...current, metric.key])}>
        <span className="trend-series-line" style={{ background: palette[index % palette.length] }} />{metric.label}
      </button>)}
    </div>
  </section>;
}
