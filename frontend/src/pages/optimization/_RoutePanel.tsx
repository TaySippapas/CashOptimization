import type { Branch, RoutePlan } from "@/types";
import { thb, km } from "@/utils/format";
import { isEmergencyStop } from "@/components/maps/MapView";
import Skeleton from "@/components/Skeleton";
import SkeletonVehCard from "./_SkeletonVehCard";
import { COLOR } from "@/utils/colors";

interface Props {
  plan: RoutePlan;
  branches: Branch[];
  loading?: boolean;
}

export default function RoutePanel({ plan, branches, loading }: Props) {
  const byId = new Map(branches.map((b) => [b.id, b]));

  if (loading) {
    return (
      <div>
        <Skeleton width="70%" height={13} style={{ marginBottom: 12 }} />
        <SkeletonVehCard />
        <SkeletonVehCard />
      </div>
    );
  }

  return (
    <div>
      <div className="section-title">Optimized dispatch · {plan.vehiclesUsed} vans · {plan.branchesServed} stops</div>
      {plan.vehicles.map((v) => (
        <div className="veh-card" key={v.vehicleId}>
          <div className="veh-head">
            <div className="bar" style={{ background: v.color }} />
            <div style={{ flex: 1 }}>
              <div className="title">{v.label}</div>
              <div className="stat">
                {km(v.totalDistanceKm)} · {Math.round((v.driveMinutes + v.serviceMinutes) / 6) / 10}h ·{" "}
                {v.stops.length} stops
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="stat">deliver {thb(v.cashDelivered)}</div>
              <div className="stat">pickup {thb(v.cashPickedUp)}</div>
            </div>
          </div>
          {v.stops.map((s) => {
            const b = byId.get(s.branchId)!;
            const isEmergency =
              b.projectedClosingCash < b.minThreshold * 0.5 || b.projectedClosingCash > b.cashCapacity * 0.95;
            // Demo: every 4th stop is a combined Delivery + Pickup service.
            const isBoth = s.seq % 4 === 0;
            const isRep = b.demand > 0;
            const tag = isBoth ? "BOTH" : isRep ? "DELIVERY" : "PICKUP";
            const tagClass = isBoth ? "both" : isRep ? "rep" : "pick";
            const amtColor = isBoth ? COLOR.purple : isRep ? COLOR.amber : COLOR.accent;
            return (
              <div className="stop" key={s.branchId}>
                <div className="seq" style={{ border: `2px solid ${isBoth ? COLOR.purple : v.color}` }}>{s.seq}</div>
                <div className="s-name">
                  <div className="n">{b.name}{isEmergency ? " ⚠" : ""}</div>
                  <div className="d">
                    {b.district} · <span className={`tag ${tagClass}`}>{tag}</span>
                    {isEmergency && <span className="tag emergency">EMERGENCY</span>}
                  </div>
                </div>
                <div className="s-right">
                  <div className="amt" style={{ color: amtColor }}>
                    {isRep ? "+" : "−"}
                    {thb(Math.abs(b.demand))}
                  </div>
                  <div className="t">ETA {s.arrival} · {s.cumulativeKm} km</div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
