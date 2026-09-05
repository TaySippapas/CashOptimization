import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { StopType } from "@/types";
import { thb } from "@/utils/format";
import { useAppData } from "@/hooks/useAppData";
import StatusDot from "@/components/StatusDot";
import StatBox, { SkeletonStatBox } from "@/components/StatBox";
import Pill from "@/components/Pill";
import Skeleton from "@/components/Skeleton";
import { COLOR } from "@/utils/colors";
import { ROUTE_STATUS_COLOR, STOP_STATUS_COLOR, STOP_TYPE_COLOR as TYPE_COLOR } from "@/domain/routeExec";

const TYPE_LABEL: Record<StopType, string> = {
  Deliver: "Delivery",
  Pickup: "Pickup",
  Mixed: "Both (Del + Pick)",
  Start: "Start",
  Return: "Return",
};

import RoutePathMap from "@/components/maps/RoutePathMap";
import ResizableSplit from "@/components/ResizableSplit";

const TONE_COLOR: Record<"green" | "amber" | "sky", string> = {
  green: COLOR.green,
  amber: COLOR.amber,
  sky: COLOR.accent,
};

export default function RouteDetailPage() {
  const { execs, dataLoading } = useAppData();
  const navigate = useNavigate();
  const { routeId: initialRouteId } = useParams<{ routeId: string }>();
  const [routeId, setRouteId] = useState<string>(
    () => initialRouteId || execs[0]?.routeId || ""
  );
  const exec = execs.find((e) => e.routeId === routeId) ?? execs[0];
  if (!exec) {
    return (
      <div className="track-page">
        <div className="detail-bar">
          <button
            type="button"
            className="btn sm detail-back"
            onClick={() => navigate("/routes")}
          >
            <ArrowLeft size={14} /> Route Tracking
          </button>
          <span style={{ color: "var(--muted)" }}>No routes available.</span>
        </div>
      </div>
    );
  }

  const utilPct = exec.utilizationPct ?? (exec.vehicleCapacity ? Math.round((exec.cashOnBoard / exec.vehicleCapacity) * 100) : 0);

  return (
    <div className="track-page">
      <div className="detail-bar">
        <button
          type="button"
          className="btn sm detail-back"
          onClick={() => navigate("/routes")}
        >
          <ArrowLeft size={14} /> Route Tracking
        </button>
        <div className="detail-select">
          <label>Select Route</label>
          <select className="select-inline" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            {execs.map((e) => (
              <option key={e.routeId} value={e.routeId}>{e.routeId} · {e.label}</option>
            ))}
          </select>
        </div>
        <div className="detail-select">
          <label>Truck</label>
          <div className="detail-truck">{exec.truckId}{exec.plateNumber ? ` · ${exec.plateNumber}` : ""}</div>
        </div>
        <Pill color={ROUTE_STATUS_COLOR[exec.status]} size="lg" style={{ marginLeft: "auto" }}>
          ● {exec.status}
        </Pill>
      </div>

      <div className="detail-stats">
        {dataLoading ? (
          <>
            <SkeletonStatBox wide />
            <SkeletonStatBox />
            <SkeletonStatBox />
            <SkeletonStatBox />
            <SkeletonStatBox />
            <SkeletonStatBox />
          </>
        ) : (
          <>
            <StatBox label="Start Depot" value={exec.depot} wide />
            <StatBox label="Total Stops" value={String(exec.totalStops)} />
            <StatBox label="Completed" value={String(exec.completed)} valueColor={TONE_COLOR.green} />
            <StatBox label="Remaining" value={String(exec.remaining)} valueColor={TONE_COLOR.amber} />
            <StatBox label="Distance Left" value={`${exec.distanceLeftKm} km`} />
            <StatBox label="ETA Return" value={exec.etaReturn} />
          </>
        )}
      </div>

      <ResizableSplit
        id="route-detail"
        left={
        <div className="panel" style={dataLoading ? { display: "flex", flexDirection: "column" } : undefined}>
          <div className="panel-head">
            <h2>{exec.routeId} · {exec.label}</h2>
            <span className="hint">{exec.truckId}{exec.plateNumber ? ` (${exec.plateNumber})` : ""} · legend shows stop type · status · emergency</span>
          </div>
          {dataLoading ? (
            <Skeleton height="100%" radius={0} style={{ flex: 1, minHeight: 430 }} />
          ) : (
            <RoutePathMap exec={exec} />
          )}
        </div>
        }
        right={
        <div className="panel">
          <div className="panel-head">
            <h2>Stop List</h2>
            <span className="hint">{exec.completed}/{exec.totalStops} completed</span>
          </div>
          <div className="panel-body" style={{ padding: 0, maxHeight: "clamp(280px, 50vh, 520px)", overflowY: "auto" }}>
            <table className="branch-table stop-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="num">ETA</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {dataLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td><Skeleton width={16} height={11} /></td>
                      <td><Skeleton width="70%" height={12} /></td>
                      <td><Skeleton width={60} height={11} /></td>
                      <td><Skeleton width={80} height={11} /></td>
                      <td className="num"><Skeleton width={40} height={11} style={{ marginLeft: "auto" }} /></td>
                      <td className="num"><Skeleton width={60} height={11} style={{ marginLeft: "auto" }} /></td>
                    </tr>
                  ))
                  : exec.stops.map((s) => (
                    <tr key={s.seq}>
                      <td style={{ color: "var(--muted)" }}>{s.type === "Start" ? "S" : s.type === "Return" ? "R" : s.seq}</td>
                      <td style={{ fontWeight: 600 }}>{s.location}</td>
                      <td><span style={{ color: TYPE_COLOR[s.type], fontWeight: 600 }}>{s.category || TYPE_LABEL[s.type]}</span></td>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: STOP_STATUS_COLOR[s.status] }}>
                          <StatusDot color={STOP_STATUS_COLOR[s.status]} />
                          {s.status}
                        </span>
                      </td>
                      <td className="num">{s.eta}</td>
                      <td className="num" style={{ color: s.amount > 0 ? COLOR.amber : s.amount < 0 ? COLOR.sky : "var(--muted)" }}>
                        {s.amount === 0 ? "—" : `${s.amount > 0 ? "+" : "−"}${thb(Math.abs(s.amount))}`}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        }
      />

      <div className="detail-cash">
        {dataLoading ? (
          <>
            <div className="cash-cap">
              <div className="cc-head">
                <Skeleton width={150} height={10} />
                <Skeleton width={110} height={12} />
              </div>
              <Skeleton height={12} radius={999} />
            </div>
            <SkeletonStatBox />
            <SkeletonStatBox />
            <SkeletonStatBox />
          </>
        ) : (
          <>
            <div className="cash-cap">
              <div className="cc-head">
                <span className="k-label">Vehicle Capacity (Cash)</span>
                <span>{thb(exec.cashOnBoard)} / {thb(exec.vehicleCapacity)} <b style={{ color: COLOR.accent }}>({utilPct}%)</b></span>
              </div>
              <div className="cc-bar"><div className="cc-fill" style={{ width: `${Math.min(100, utilPct)}%` }} /></div>
            </div>
            <StatBox label="Cash On Board" value={`${thb(exec.cashOnBoard)}`} sub="Net secured" valueColor={TONE_COLOR.sky} />
            <StatBox label="Pickup Amount" value={thb(exec.pickupAmount)} sub="collected" valueColor={TONE_COLOR.sky} />
            <StatBox label="Delivery Amount" value={thb(exec.deliveryAmount)} sub="dispensed" valueColor={TONE_COLOR.amber} />
          </>
        )}
      </div>
    </div>
  );
}
