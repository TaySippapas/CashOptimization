import type { ReactNode } from "react";
import Skeleton from "@/components/Skeleton";

export function SkeletonRibbonStat() {
  return (
    <div className="ribbon-stat">
      <Skeleton width={70} height={9} style={{ marginBottom: 6 }} />
      <Skeleton width={50} height={16} style={{ marginBottom: 4 }} />
      <Skeleton width={80} height={9} />
    </div>
  );
}

export default function RibbonStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: ReactNode;
  accent: string;
}) {
  return (
    <div className="ribbon-stat">
      <div className="r-label">{label}</div>
      <div className="r-value" style={{ color: accent }}>
        {value}
      </div>
      <div className="r-sub">{sub}</div>
    </div>
  );
}
