import StatusDot from "@/components/StatusDot";

export default function StatusRow({ color, label, value, total }: { color: string; label: string; value: number; total: number }) {
  const p = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="status-row">
      <StatusDot color={color} />
      <span className="sr-label">{label}</span>
      <span className="sr-value">{value} ({p}%)</span>
    </div>
  );
}
