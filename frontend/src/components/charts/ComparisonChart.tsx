import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import type { RoutePlan } from "@/types";
import { COLOR } from "@/utils/colors";

interface Props {
  optimized: RoutePlan;
  original: RoutePlan;
}

const AXIS = "#8a97b1";

function MiniBar({
  title,
  unit,
  original,
  optimized,
}: {
  title: string;
  unit: string;
  original: number;
  optimized: number;
}) {
  const data = [
    { name: "Actual", value: original, fill: COLOR.red },
    { name: "Optimized", value: optimized, fill: COLOR.green },
  ];
  return (
    <div>
      <div className="section-title" style={{ margin: "0 0 6px" }}>
        {title} <span style={{ color: "#5b6884" }}>({unit})</span>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{ background: "#0f1728", border: "1px solid #26314a", borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={46}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              fill="#e6ecf7"
              fontSize={12}
              formatter={(v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ComparisonChart({ optimized, original }: Props) {
  return (
    <div className="compare-grid">
      <MiniBar title="Total distance" unit="km" original={original.totalDistanceKm} optimized={optimized.totalDistanceKm} />
      <MiniBar title="Crew man-hours" unit="hours" original={original.totalManHours} optimized={optimized.totalManHours} />
      <MiniBar
        title="On-road time"
        unit="min"
        original={original.totalDriveMinutes + original.totalServiceMinutes}
        optimized={optimized.totalDriveMinutes + optimized.totalServiceMinutes}
      />
      <MiniBar title="Vehicles deployed" unit="vans" original={original.vehiclesUsed} optimized={optimized.vehiclesUsed} />
    </div>
  );
}
