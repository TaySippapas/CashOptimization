import type { ReactNode } from "react";
import { Clock, Banknote, Route, Truck, TrendingDown, Leaf } from "lucide-react";
import type { ExecMetrics } from "@/types";
import { thb } from "@/utils/format";
import { ReductionBadge } from "@/components/TrendIcon";
import KpiCard from "@/components/KpiCard";
import { COLOR } from "@/utils/colors";

interface KpiCardData {
  icon: typeof Clock;
  color: string;
  label: string;
  value: ReactNode;
  sub: ReactNode;
  tone?: "green" | "cash";
}

export default function KpiCards({ m }: { m: ExecMetrics }) {
  const cards: KpiCardData[] = [
    {
      icon: Clock,
      color: "#4ade80",
      label: "Man-hours saved / day",
      value: `${m.manHoursSaved} h`,
      sub: <ReductionBadge pct={m.manHoursSavedPct} label="vs current route" />,
      tone: "green",
    },
    {
      icon: Banknote,
      color: COLOR.accent,
      label: "Idle cash reduction",
      value: thb(m.idleCashReductionThb),
      sub: <ReductionBadge pct={m.idleCashReductionPct} label="vault cash freed" />,
      tone: "cash",
    },
    {
      icon: Route,
      color: COLOR.accent,
      label: "Distance reduced",
      value: `${m.distanceSavedKm} km`,
      sub: <ReductionBadge pct={m.distanceSavedPct} label="per planning cycle" />,
    },
    {
      icon: Banknote,
      color: COLOR.amber,
      label: "Transport cost saved",
      value: thb(m.fuelCostSavedThb),
      sub: "fuel · crew · carrier / day",
    },
    {
      icon: Truck,
      color: "#a78bfa",
      label: "Fleet utilization",
      value: `${m.branchesServed}/${m.branchesTotal}`,
      sub: "branches served this cycle",
    },
    {
      icon: TrendingDown,
      color: "#4ade80",
      label: "On-time SLA",
      value: `${m.onTimePct}%`,
      sub: "within branch time windows",
    },
    {
      icon: Banknote,
      color: COLOR.accent,
      label: "Idle cash before → after",
      value: thb(m.idleCashAfterThb),
      sub: `from ${thb(m.idleCashBeforeThb)} idle`,
    },
    {
      icon: Leaf,
      color: "#4ade80",
      label: "CO₂ avoided",
      value: `${m.co2SavedKg} kg`,
      sub: "lower armored-fleet mileage",
    },
  ];

  return (
    <div className="kpi-grid">
      {cards.map((c) => (
        <KpiCard
          key={c.label}
          icon={<c.icon size={20} color={c.color} />}
          label={c.label}
          value={String(c.value)}
          sub={c.sub}
          tone={c.tone}
        />
      ))}
    </div>
  );
}
