import Skeleton from "@/components/Skeleton";

export default function SkeletonVehCard() {
  return (
    <div className="veh-card">
      <div className="veh-head">
        <Skeleton width={4} height={34} radius={2} />
        <div style={{ flex: 1 }}>
          <Skeleton width="55%" height={13} style={{ marginBottom: 5 }} />
        </div>
        <div style={{ textAlign: "right", display: "flex", gap: 8 }}>
          <Skeleton width={70} height={10} style={{ marginBottom: 5, marginLeft: "auto" }} />
          <Skeleton width={60} height={10} style={{ marginBottom: 5, marginLeft: "auto" }} />
        </div>
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div className="stop" key={i}>
          <Skeleton width={24} height={24} radius={999} />
          <div className="s-name">
            <Skeleton width="60%" height={12} style={{ marginBottom: 5 }} />
          </div>
          <div className="s-right" style={{ display: "flex", gap: 8 }}>
            <Skeleton width={50} height={11} style={{ marginBottom: 5, marginLeft: "auto" }} />
            <Skeleton width={80} height={10} style={{ marginBottom: 5, marginLeft: "auto" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
