import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  Sector,
  Rectangle,
} from "recharts";
import type { Denomination } from "@/types";
import { COLOR } from "@/utils/colors";

const DENOM_COLORS = [COLOR.accent, COLOR.green, COLOR.amber, COLOR.purple];

function toRows(d: Denomination) {
  return [
    { name: "฿1,000", value: d.b1000 },
    { name: "฿500", value: d.b500 },
    { name: "฿100", value: d.b100 },
    ...(d.b50 ? [{ name: "฿50", value: d.b50 }] : []),
  ];
}

/** Enlarge the active slice while retaining its denomination color. */
function ActiveDonutSlice({
  cx,
  cy,
  innerRadius,
  outerRadius,
  startAngle,
  endAngle,
  fill,
}: {
  cx?: number;
  cy?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  fill?: string;
}) {
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={(outerRadius ?? 0) + 10}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      stroke="none"
    />
  );
}

function DenomLegend({
  rows,
  activeIndex,
  onHover,
  total,
}: {
  rows: { name: string; value: number }[];
  activeIndex: number | null;
  onHover: (i: number | null) => void;
  total: number;
}) {
  return (
    <ul className="denom-legend">
      {rows.map((r, i) => {
        const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
        return (
          <li
            key={r.name}
            className={activeIndex === i ? "active" : ""}
            onMouseEnter={() => onHover(i)}
            onMouseLeave={() => onHover(null)}
          >
            <span className="denom-swatch" style={{ background: DENOM_COLORS[i] }} />
            <span className="denom-name">{r.name}</span>
            <span className="denom-pct">{r.value.toLocaleString()} ({pct}%)</span>
          </li>
        );
      })}
    </ul>
  );
}

export function DenominationDonut({ data, height = "100%" }: { data: Denomination; height?: number | "100%" }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const rows = toRows(data);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const isFluid = height === "100%";

  return (
    <div className="denom-donut-wrap" style={isFluid ? { height: "100%" } : undefined}>
      <ResponsiveContainer
        width="100%"
        height={isFluid ? "100%" : Math.max(120, height - 52)}
        style={isFluid ? { flex: 1 } : undefined}
      >
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            innerRadius="52%"
            outerRadius="80%"
            paddingAngle={2}
            stroke="none"
            activeIndex={activeIndex ?? undefined}
            activeShape={ActiveDonutSlice}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            {rows.map((_, i) => (
              <Cell key={i} fill={DENOM_COLORS[i]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--popup-bg, var(--panel))",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--text)",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
            }}
            labelStyle={{ color: "var(--text)" }}
            itemStyle={{ color: "var(--text)" }}
            formatter={(v: number, n: string) => {
              const pct = total > 0 ? Math.round((v / total) * 100) : 0;
              const thb = v >= 1000 ? `฿${((v * denomValue(n)) / 1_000_000).toFixed(1)}M` : `฿${v * denomValue(n)}`;
              return [`${v.toLocaleString()} notes (${pct}%) · ${thb}`, n];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <DenomLegend rows={rows} activeIndex={activeIndex} onHover={setActiveIndex} total={total} />
    </div>
  );
}

/** Extract denom value from label like "฿1,000" */
function denomValue(name: string): number {
  const n = parseInt(name.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 1 : n;
}

function gapAmount(v: number): string {
  const sign = v < 0 ? "−" : "+";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}฿${(abs / 1_000_000).toFixed(1)}M`;
  return `${sign}฿${Math.round(abs / 1000)}K`;
}

/** Label sits just outside the bar end, flipping side with the sign. */
function GapLabel(props: { x?: number; y?: number; width?: number; height?: number; value?: number }) {
  const { x = 0, y = 0, width = 0, height = 0, value = 0 } = props;
  const negative = value < 0;
  // Recharts may report width as negative for left-growing bars.
  const left = Math.min(x, x + width);
  const right = Math.max(x, x + width);
  const tx = negative ? left - 8 : right + 8;
  return (
    <text
      x={tx}
      y={y + height / 2}
      dy={4}
      textAnchor={negative ? "end" : "start"}
      fontSize={10}
      fontWeight={600}
      fill={negative ? COLOR.red : COLOR.green}
    >
      {gapAmount(value)}
    </text>
  );
}

function DenominationBarTooltip({
  active,
  segment,
}: {
  active?: boolean;
  segment?: { name: string; key: "actual" | "plan"; amount: number };
}) {
  if (!active || !segment) return null;
  const isActual = segment.key === "actual";
  return (
    <div className="gap-tooltip">
      <div className="gap-tooltip-label">{segment.name} · {isActual ? "Actual (d-1)" : "Delivery Plan (d)"}</div>
      <div className="gap-tooltip-value" style={{ color: isActual ? COLOR.accent : COLOR.amber, fontSize: 18 }}>
        ฿{segment.amount.toLocaleString()}
      </div>
    </div>
  );
}

/** Grow vertically only, so the segment's cash amount stays true to the axis. */
function ActiveDenominationBar({ x = 0, y = 0, width = 0, height = 0, fill }: {
  x?: number; y?: number; width?: number; height?: number; fill?: string;
}) {
  return <Rectangle x={x} y={y - 3} width={width} height={height + 6} fill={fill} stroke="none" radius={3} />;
}

/** Stacked bar: Actual vault (d-1) + Delivery Plan (d) per denomination. */
export function DenominationGap({ data, height = 180 }: { data: Record<string, number>; height?: number }) {
  const [hovered, setHovered] = useState<{ key: "actual" | "plan"; index: number } | null>(null);
  const d = data as Record<string, number>;
  const rows = [
    { name: "฿1000", actual: d.actual_b1000 ?? 0, plan: d.b1000 ?? 0 },
    { name: "฿500", actual: d.actual_b500 ?? 0, plan: d.b500 ?? 0 },
    { name: "฿100", actual: d.actual_b100 ?? 0, plan: d.b100 ?? 0 },
    { name: "฿50", actual: d.actual_b50 ?? 0, plan: d.b50 ?? 0 },
  ];
  // Stacked tooltip payloads can retain the first series. The hovered bar is
  // authoritative for both the amount and color, including when moving within a row.
  const hoveredRow = hovered ? rows[hovered.index] : undefined;
  const segment = hovered && hoveredRow ? { name: hoveredRow.name, key: hovered.key, amount: hoveredRow[hovered.key] } : undefined;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 6, right: 60, left: 4, bottom: 2 }}>
        <XAxis
          type="number"
          tick={{ fill: "var(--muted)", fontSize: 10 }}
          tickFormatter={(v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip cursor={false} shared={false} content={<DenominationBarTooltip segment={segment} />} />
        <Bar dataKey="actual" stackId="denom" fill={COLOR.accent} barSize={20} radius={[0, 0, 0, 0]} name="actual"
          activeBar={<ActiveDenominationBar />} activeIndex={hovered?.key === "actual" ? hovered.index : -1}
          onMouseEnter={(_, index) => setHovered({ key: "actual", index })} onMouseLeave={() => setHovered(null)} />
        <Bar dataKey="plan" stackId="denom" fill={COLOR.amber} barSize={20} radius={[0, 4, 4, 0]} name="plan"
          activeBar={<ActiveDenominationBar />} activeIndex={hovered?.key === "plan" ? hovered.index : -1}
          onMouseEnter={(_, index) => setHovered({ key: "plan", index })} onMouseLeave={() => setHovered(null)} />
      </BarChart>
    </ResponsiveContainer>
  );
}
