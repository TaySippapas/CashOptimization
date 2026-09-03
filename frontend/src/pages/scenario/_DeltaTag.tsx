import type { SimResultRow } from "@/domain/scenario";

export default function DeltaTag({ row }: { row: SimResultRow }) {
  if (row.unit === "pct") {
    const good = row.deltaPct >= 0;
    if (row.deltaPct === 0) return <span className="sc-delta flat">(=)</span>;
    return (
      <span className={`sc-delta ${good ? "good" : "bad"}`}>
        ({row.deltaPct > 0 ? "+" : ""}
        {row.deltaPct}pp)
      </span>
    );
  }
  if (row.deltaPct === 0) return <span className="sc-delta flat">(=)</span>;
  const worse = row.higherIsWorse ? row.deltaPct > 0 : row.deltaPct < 0;
  return (
    <span className={`sc-delta ${worse ? "bad" : "good"}`}>
      ({row.deltaPct > 0 ? "+" : ""}
      {row.deltaPct}%)
    </span>
  );
}
