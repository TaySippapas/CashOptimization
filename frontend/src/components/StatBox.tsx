import type { ReactNode } from "react";
import Skeleton from "./Skeleton";

export function SkeletonStatBox({ wide }: { wide?: boolean }) {
  return (
    <div className={`stat-box ${wide ? "wide" : ""}`.trim()}>
      <Skeleton width="50%" height={9} radius={3} style={{ marginBottom: 8 }} />
      <Skeleton width="65%" height={18} radius={4} />
    </div>
  );
}

export default function StatBox({
  label,
  value,
  sub,
  valueColor,
  accentColor,
  wide,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  /** Colors the value text — e.g. COLOR.green for a positive stat. */
  valueColor?: string;
  /** Adds a colored left border, for stats grouped by category. */
  accentColor?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`stat-box ${wide ? "wide" : ""}`.trim()}
      style={accentColor ? { borderLeft: `3px solid ${accentColor}` } : undefined}
    >
      <div className="k-label">{label}</div>
      <div className="k-value" style={{ color: valueColor, fontSize: wide ? 15 : undefined }}>
        {value}
      </div>
      {sub && <div className="k-sub">{sub}</div>}
    </div>
  );
}
