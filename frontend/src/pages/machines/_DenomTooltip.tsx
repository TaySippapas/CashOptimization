import { useState, useRef } from "react";
import { Info } from "lucide-react";
import type { DenominationDetail } from "@/types";
import { COLOR } from "@/utils/colors";

const DENOM_LABEL: Record<number, string> = { 1000: "฿1,000", 500: "฿500", 100: "฿100" };

function fmt(v: number): string {
  if (v >= 1_000_000) return `฿${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `฿${Math.round(v / 1000)}K`;
  return `฿${v}`;
}

/** Hover tooltip showing per-denomination breakdown. Page-private. */
export default function DenomTooltip({ detail }: { detail: DenominationDetail[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  if (!detail.length) return null;

  return (
    <div
      className="denom-tip-wrap"
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{ position: "relative", display: "inline-flex" }}
    >
      <Info size={13} color="var(--muted)" style={{ cursor: "help" }} />
      {open && (
        <div className="denom-tip-popup">
          <table className="denom-tip-table">
            <thead>
              <tr>
                <th>Denom</th>
                <th className="num">Remaining</th>
                <th className="num">Add</th>
                <th className="num">Remove</th>
              </tr>
            </thead>
            <tbody>
              {detail.map((d) => (
                <tr key={d.denom}>
                  <td>{DENOM_LABEL[d.denom]}</td>
                  <td className="num">
                    <span>{d.predictedNotes.toLocaleString()} notes</span>
                    <span className="sub"> ({fmt(d.predictedThb)})</span>
                  </td>
                  <td className="num" style={{ color: d.addNotes > 0 ? COLOR.green : undefined }}>
                    {d.addNotes > 0 ? `+${d.addNotes.toLocaleString()}` : "—"}
                  </td>
                  <td className="num" style={{ color: d.removeNotes > 0 ? COLOR.red : undefined }}>
                    {d.removeNotes > 0 ? `−${d.removeNotes.toLocaleString()}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
