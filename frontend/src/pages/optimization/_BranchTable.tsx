import type { Branch } from "@/types";
import { thb } from "@/utils/format";
import Skeleton from "@/components/Skeleton";

export default function BranchTable({ branches, loading }: { branches: Branch[]; loading?: boolean }) {
  const rows = branches.filter((b) => !b.isDepot);
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Branch Cash Forecast (ML model output)</h2>
        <span className="hint">{rows.length} branches · predicted for plan date</span>
      </div>
      <div className="panel-body" style={{ padding: 0, maxHeight: "clamp(220px, 34vh, 360px)", overflowY: "auto" }}>
        <table className="branch-table">
          <thead>
            <tr>
              <th>Branch</th>
              <th>District</th>
              <th className="num">Pred. inflow</th>
              <th className="num">Pred. outflow</th>
              <th className="num">Proj. closing</th>
              <th>Status</th>
              <th className="num">Action amount</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  <td>
                    <Skeleton width="75%" height={12} style={{ marginBottom: 4 }} />
                    <Skeleton width="40%" height={10} />
                  </td>
                  <td><Skeleton width={70} height={11} /></td>
                  <td className="num"><Skeleton width={70} height={11} style={{ marginLeft: "auto" }} /></td>
                  <td className="num"><Skeleton width={70} height={11} style={{ marginLeft: "auto" }} /></td>
                  <td className="num"><Skeleton width={70} height={11} style={{ marginLeft: "auto" }} /></td>
                  <td><Skeleton width={60} height={18} radius={999} /></td>
                  <td className="num"><Skeleton width={60} height={11} style={{ marginLeft: "auto" }} /></td>
                </tr>
              ))
              : rows.map((b) => (
                <tr key={b.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{b.name}</div>
                    <div style={{ color: "var(--muted)", fontSize: 10 }}>{b.code}</div>
                  </td>
                  <td style={{ color: "var(--muted)" }}>{b.district}</td>
                  <td className="num">{thb(b.predictedInflow)}</td>
                  <td className="num">{thb(b.predictedOutflow)}</td>
                  <td className="num">{thb(b.projectedClosingCash)}</td>
                  <td>
                    <span className={`status-chip ${b.status}`}>
                      {b.status === "REPLENISH" ? "Delivery" : b.status === "PICKUP" ? "Pickup" : "OK"}
                    </span>
                  </td>
                  <td className="num">{b.demand === 0 ? "—" : thb(Math.abs(b.demand))}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
