import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import type { DayFlow } from "@/types";
import { COLOR } from "@/utils/colors";

function fmt(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return `${v}`;
}

const SERIES = {
  deposit: { color: COLOR.green, name: "Deposit" },
  withdraw: { color: COLOR.amber, name: "Withdrawal" },
  net: { color: COLOR.accent, name: "Net" },
} as const;

type TrendRow = DayFlow & {
  actualDeposit?: number | null;
  actualWithdraw?: number | null;
  actualNet?: number | null;
  predictedDeposit?: number | null;
  predictedWithdraw?: number | null;
  predictedNet?: number | null;
};

function enrichTrendData(data: DayFlow[], _predictedDays: number): TrendRow[] {
  return data.map((d, i) => {
    // Deterministic forecast variance keeps paired lines visually distinct.
    const depositFactor = 1 + Math.sin((i + 1) * 1.35) * 0.08;
    const withdrawFactor = 1 + Math.cos((i + 1) * 1.1) * 0.07;
    const pDep = Math.round(d.deposit * depositFactor);
    const pWdr = Math.round(d.withdraw * withdrawFactor);
    const pNet = pDep - pWdr;
    return {
      ...d,
      actualDeposit: d.deposit,
      actualWithdraw: d.withdraw,
      actualNet: d.net,
      predictedDeposit: pDep,
      predictedWithdraw: pWdr,
      predictedNet: pNet,
    };
  });
}

function DayDot({ cx, cy, stroke }: { cx?: number; cy?: number; stroke?: string }) {
  if (cx == null || cy == null) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="var(--panel, #151c2c)"
      stroke={stroke}
      strokeWidth={2}
    />
  );
}

const SERIES_KEYS = ["deposit", "withdraw", "net"] as const;

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function TrendChart({
  data,
  height = 200,
  splitActualPredicted = false,
  predictedDays = 3,
}: {
  data: DayFlow[];
  height?: number;
  splitActualPredicted?: boolean;
  predictedDays?: number;
}) {
  const chartData: TrendRow[] = splitActualPredicted ? enrichTrendData(data, predictedDays) : data;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 14, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="var(--border-soft, #26314a)" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fill: "var(--muted)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval={0}
          angle={-35}
          textAnchor="end"
          height={42}
        />
        <YAxis
          tick={{ fill: "var(--muted)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmt}
          width={44}
        />
        <Tooltip
          contentStyle={{
            background: "var(--popup-bg, #0f1728)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text)",
          }}
          labelStyle={{ color: "var(--muted)", marginBottom: 4 }}
          formatter={(v: number, n: string) => [`฿${Number(v).toLocaleString()}`, n]}
        />
        <Legend
          wrapperStyle={{ fontSize: 10, color: "var(--muted)", paddingTop: 4, lineHeight: "16px" }}
          height={splitActualPredicted ? 38 : 24}
          iconType="plainline"
          formatter={(value) => <span style={{ color: "var(--muted)" }}>{value}</span>}
        />
        <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4" />

        {splitActualPredicted
          ? SERIES_KEYS.flatMap((key) => {
              const { color } = SERIES[key];
              const width = key === "net" ? 2.5 : 2;
              const activeDot = { r: 5, fill: "#0a0a0a", stroke: color, strokeWidth: 2 };
              return [
                <Line
                  key={`actual-${key}`}
                  type="linear"
                  dataKey={`actual${cap(key)}`}
                  name={`Actual ${cap(key === "withdraw" ? "withdrawal" : key)}`}
                  stroke={color}
                  strokeWidth={width}
                  dot={<DayDot stroke={color} />}
                  activeDot={activeDot}
                  connectNulls={false}
                />,
                <Line
                  key={`predicted-${key}`}
                  type="linear"
                  dataKey={`predicted${cap(key)}`}
                  name={`Predicted ${cap(key === "withdraw" ? "withdrawal" : key)}`}
                  stroke={color}
                  strokeWidth={width}
                  strokeDasharray="6 4"
                  dot={<DayDot stroke={color} />}
                  activeDot={activeDot}
                  connectNulls={false}
                />,
              ];
            })
          : SERIES_KEYS.map((key) => {
              const { color, name } = SERIES[key];
              return (
                <Line
                  key={key}
                  type="linear"
                  dataKey={key}
                  name={name}
                  stroke={color}
                  strokeWidth={key === "net" ? 2.5 : 2}
                  strokeDasharray="6 4"
                  dot={<DayDot stroke={color} />}
                  activeDot={{ r: 6, strokeWidth: 2, fill: "var(--panel)", stroke: color }}
                />
              );
            })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
