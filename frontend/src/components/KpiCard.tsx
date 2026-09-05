import type { ReactNode } from "react";
import SparkLine from "./SparkLine";
import { TrendIcon } from "./TrendIcon";
import { COLOR } from "@/utils/colors";
import Skeleton from "./Skeleton";

export function SkeletonKpiCard() {
  return (
    <div className="eo-kpi">
      <div className="eo-kpi-top">
        <Skeleton width={20} height={20} radius={6} />
      </div>
      <Skeleton width="60%" height={10} radius={4} style={{ marginBottom: 8 }} />
      <Skeleton width="45%" height={20} radius={4} />
    </div>
  );
}

interface Delta {
  text: string;
  dir: "up" | "down" | "flat";
  good: boolean;
}

export default function KpiCard({
  icon,
  label,
  value,
  delta,
  sub,
  spark,
  tone,
  qualifier,
  compareLabel = "vs last week",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta?: Delta;
  /** Free-form caption shown when there's no discrete up/down delta to report. Ignored if `delta` is set. */
  sub?: ReactNode;
  spark?: number[];
  tone?: "green" | "amber" | "danger" | "cash";
  /** How the figure was rolled up over a multi-day window, e.g. "avg/day" or
   *  "total". Without it a period view can't be read unambiguously. */
  qualifier?: string;
  compareLabel?: string;
}) {
  return (
    <div className={`eo-kpi ${tone ?? ""}`}>
      <div className="eo-kpi-top">
        <span className="eo-kpi-icon">{icon}</span>
        {spark && <SparkLine data={spark} color={tone === "danger" ? COLOR.red : tone === "green" ? COLOR.green : COLOR.accent} wFull />}
      </div>
      <div className="eo-kpi-label">
        {label}
        {qualifier && <span className="eo-kpi-qualifier">{qualifier}</span>}
      </div>
      <div className="eo-kpi-value">{value}</div>
      {delta ? (
        <div className="eo-kpi-delta">
          <span className={delta.good ? "good" : "bad"}>
            <TrendIcon dir={delta.dir} /> {delta.text}
          </span>
          <span className="eo-kpi-vs">{compareLabel}</span>
        </div>
      ) : (
        sub && <div className="eo-kpi-sub">{sub}</div>
      )}
    </div>
  );
}