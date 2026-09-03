import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export type TrendDir = "up" | "down" | "flat";

export function trendDirFromValue(n: number): TrendDir {
  if (n > 0) return "up";
  if (n < 0) return "down";
  return "flat";
}

export function TrendIcon({ dir, size = 12 }: { dir: TrendDir; size?: number }) {
  const Icon = (dir === "up") ? TrendingUp : (dir === "down") ? TrendingDown : Minus;
  return <Icon size={size} style={{ verticalAlign: -2 }} />;
}

/** `pct` is a reduction percentage — positive means it went down (good). */
export function ReductionBadge({ pct, label }: { pct: number; label?: string }) {
  return (
    <>
      <span className={pct >= 0 ? "up" : "down"}>
        <TrendIcon dir={pct >= 0 ? "down" : "up"} /> {Math.abs(pct)}%
      </span>
      {label && <> {label}</>}
    </>
  );
}
