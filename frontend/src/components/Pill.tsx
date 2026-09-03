import type { CSSProperties, ReactNode } from "react";

export default function Pill({
  color,
  children,
  size = "sm",
  style,
}: {
  color: string;
  children: ReactNode;
  size?: "sm" | "lg";
  style?: CSSProperties;
}) {
  return (
    <span
      className={`pill-tag${size === "lg" ? " lg" : ""}`}
      style={{ color, borderColor: `${color}55`, background: `${color}18`, ...style }}
    >
      {children}
    </span>
  );
}
