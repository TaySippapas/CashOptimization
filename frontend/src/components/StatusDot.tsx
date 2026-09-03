export default function StatusDot({ color }: { color: string }) {
  return <span className="status-dot" style={{ background: color }} />;
}
