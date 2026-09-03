import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export default function SortTh<K extends string>({
  label,
  col,
  num,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  col: K;
  num?: boolean;
  sortKey: K;
  sortDir: "asc" | "desc";
  onSort: (col: K) => void;
}) {
  const active = sortKey === col;
  return (
    <th className={num ? "num" : undefined} style={{ cursor: "pointer", userSelect: "none" }} onClick={() => onSort(col)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        {active ? sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : <ChevronsUpDown size={12} opacity={0.35} />}
      </span>
    </th>
  );
}
