import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { AccuracyRing } from "@/domain/aiPerformance";
import { mapeColor } from "@/utils/format";

export default function AccuracyGauge({ ring }: { ring: AccuracyRing }) {
  const color = mapeColor(ring.mape);
  const data = [
    { name: "mape", value: ring.mape },
    { name: "rest", value: Math.max(0, 100 - ring.mape) },
  ];
  return (
    <div className="ai-gauge">
      <div className="ai-gauge-title">{ring.label}</div>
      <div className="ai-gauge-chart">
        <ResponsiveContainer width="100%" height={110}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              innerRadius="72%"
              outerRadius="100%"
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill="var(--border-soft)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="ai-gauge-center">
          <strong>{ring.mape}%</strong>
        </div>
      </div>
    </div>
  );
}
