export default function SparkLine({
  data,
  color,
  className,
  wFull,
}: {
  data: number[];
  color: string;
  className?: string;
  wFull?: boolean;
}) {
  const w = 72;
  const h = 20;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      width={wFull ? "100%" : w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`eo-spark${className ? ` ${className}` : ""}`}
    >
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}