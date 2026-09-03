import type { CSSProperties } from "react";

export default function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  style,
  className,
}: {
  width?: string | number;
  height?: string | number;
  radius?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      className={`skeleton ${className ?? ""}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden
    />
  );
}
