import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Truck, PackageOpen, Repeat, MinusCircle, AlertTriangle } from "lucide-react";
import { generateBranchTracks, summarizeBranchTracks, HEALTH_COLOR } from "@/domain/tracking";
import { thb } from "@/utils/format";
import HealthMap, { type MapPoint } from "@/components/maps/HealthMap";
import TrendChart from "@/components/charts/TrendChart";
import { DenominationGap } from "@/components/charts/DenominationChart";
import { useAppData } from "@/hooks/useAppData";
import KpiCard, { SkeletonKpiCard } from "@/components/KpiCard";
import StatusDot from "@/components/StatusDot";
import Skeleton from "@/components/Skeleton";
import { COLOR } from "@/utils/colors";

const ACTION_COLOR: Record<string, string> = {
  Deliver: COLOR.amber,
  Pickup: COLOR.sky,
  "No Action": COLOR.slate,
  Both: COLOR.purple,
};

const ALL_BRANCHES = "__all__";

export default function BranchTrackingPage() {
  const { config, branchTracksOverride: tracksOverride, dataLoading } = useAppData();
  const tracks = useMemo(
    () => tracksOverride ?? generateBranchTracks(config),
    [tracksOverride, config]
  );
  const summary = useMemo(() => summarizeBranchTracks(tracks), [tracks]);
  const [selectedCode, setSelectedCode] = useState<string>(ALL_BRANCHES);
  const isAll = selectedCode === ALL_BRANCHES;
  const selected = tracks.find((t) => t.code === selectedCode) ?? tracks[0];

  const trendData = isAll ? summary.trendAll : selected?.trend ?? [];
  const trendLabel = isAll ? `All branches (${tracks.length})` : selected?.name;

  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (!isAll && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedCode, isAll]);

  const points: MapPoint[] = tracks.map((t) => ({
    id: t.code,
    lat: t.lat,
    lng: t.lng,
    health: t.health,
    emphasize: t.emergency || t.code === selectedCode,
    dimmed: !isAll && t.code !== selectedCode && !t.emergency,
    title: `${t.name} · ${t.code}`,
    rows: [
      ["Actual Cash (d-1)", thb(t.currentCash)],
      ["Pred. Deposit (d)", thb(t.deposit)],
      ["Pred. Withdrawal (d)", thb(t.withdraw)],
      ["Predicted Cash (d)", thb(t.predictedCash)],
      ["Utilization", `${t.utilizationPct}%`],
      ["Action", t.action],
      ...(t.fillAmount > 0 ? ([["Fill Amount", thb(t.fillAmount)]] as [string, string][]) : []),
      ...(t.emergency ? ([["Emergency", "YES"]] as [string, string][]) : []),
    ],
  }));

  return (
    <div className="track-page">
      <div className="page-toolbar">
        <span className="pt-title">Branch Tracking · {tracks.length} branches</span>
        <select className="select-inline" value={selectedCode} onChange={(e) => setSelectedCode(e.target.value)}>
          <option value={ALL_BRANCHES}>All branches ({tracks.length})</option>
          {tracks.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name} ({t.code})
            </option>
          ))}
        </select>
        <span className="pt-date">Date: {config.params.planDate}</span>
      </div>

      <div className="kpi-grid track-kpis six">
        {dataLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonKpiCard key={i} />)
        ) : (
          <>
            <KpiCard
              icon={<Building2 size={18} color={COLOR.accent} />}
              label="Total branches"
              value={String(summary.total)}
              delta={{ text: "2.1%", dir: "up", good: true }}
            />
            <KpiCard
              icon={<Truck size={18} color={COLOR.amber} />}
              label="Delivery"
              value={String(summary.delivery)}
              delta={{ text: "8.3%", dir: "up", good: false }}
              tone="amber"
            />
            <KpiCard
              icon={<PackageOpen size={18} color={COLOR.sky} />}
              label="Pickup"
              value={String(summary.pickup)}
              delta={{ text: "5.6%", dir: "up", good: false }}
            />
            <KpiCard
              icon={<Repeat size={18} color={COLOR.purple} />}
              label="Both (Del + Pick)"
              value={String(summary.both)}
              delta={{ text: "0%", dir: "up", good: false }}
            />
            <KpiCard
              icon={<MinusCircle size={18} color={COLOR.slate} />}
              label="No action"
              value={String(summary.noAction)}
              delta={{ text: "12%", dir: "down", good: true }}
            />
            <KpiCard
              icon={<AlertTriangle size={18} color={COLOR.red} />}
              label="Emergency"
              value={String(summary.emergency)}
              delta={{ text: "14.3%", dir: "down", good: true }}
              tone="danger"
            />
          </>
        )}
      </div>

      <div className="track-split">
        <div className="panel" style={dataLoading ? { display: "flex", flexDirection: "column" } : undefined}>
          <div className="panel-head">
            <h2>Branch Health Map</h2>
            <span className="hint">{tracks.length} branches · emphasized = emergency</span>
          </div>
          {dataLoading ? (
            <Skeleton height="100%" radius={0} style={{ flex: 1, minHeight: 430 }} />
          ) : (
            <HealthMap points={points} showEmergencyLegend />
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Branch Summary</h2>
            <span className="hint">actual cash · predicted deposit / withdrawal · fill amount</span>
          </div>
          <div className="panel-body" style={{ padding: 0, maxHeight: 430, overflowY: "auto" }}>
            <table className="branch-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th className="num">Actual Cash (d-1)</th>
                  <th className="num">Pred. Deposit (d)</th>
                  <th className="num">Pred. Withdrawal (d)</th>
                  <th className="num">Predicted Cash (d)</th>
                  <th className="num">Util.%</th>
                  <th className="num">Fill Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {dataLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      <td>
                        <Skeleton width="80%" height={12} style={{ marginBottom: 4 }} />
                        <Skeleton width="55%" height={10} />
                      </td>
                      <td className="num"><Skeleton width={70} height={11} style={{ marginLeft: "auto" }} /></td>
                      <td className="num"><Skeleton width={60} height={11} style={{ marginLeft: "auto" }} /></td>
                      <td className="num"><Skeleton width={60} height={11} style={{ marginLeft: "auto" }} /></td>
                      <td className="num"><Skeleton width={70} height={11} style={{ marginLeft: "auto" }} /></td>
                      <td className="num"><Skeleton width={35} height={11} style={{ marginLeft: "auto" }} /></td>
                      <td className="num"><Skeleton width={60} height={11} style={{ marginLeft: "auto" }} /></td>
                      <td><Skeleton width={70} height={12} /></td>
                    </tr>
                  ))
                  : tracks.map((t) => (
                    <tr
                      key={t.code}
                      ref={t.code === selectedCode ? selectedRowRef : undefined}
                      onClick={() => setSelectedCode(t.code)}
                      style={{ cursor: "pointer", background: t.code === selectedCode ? "rgba(56,189,248,0.12)" : undefined }}
                    >
                      <td>
                        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                          <StatusDot color={HEALTH_COLOR[t.health]} />
                          {t.name}
                          {t.emergency && <AlertTriangle size={12} color={COLOR.red} />}
                        </div>
                        <div style={{ color: "var(--muted)", fontSize: 10 }}>
                          {t.code} · {t.district}
                        </div>
                      </td>
                      <td className="num">{thb(t.currentCash)}</td>
                      <td className="num" style={{ color: COLOR.green }}>
                        {thb(t.deposit)}
                      </td>
                      <td className="num" style={{ color: COLOR.amber }}>
                        {thb(t.withdraw)}
                      </td>
                      <td className="num">{thb(t.predictedCash)}</td>
                      <td className="num">{t.utilizationPct}%</td>
                      <td className="num" style={{ color: t.fillAmount > 0 ? COLOR.amber : undefined }}>
                        {t.fillAmount > 0 ? thb(t.fillAmount) : "—"}
                      </td>
                      <td>
                        <span style={{ color: ACTION_COLOR[t.action], fontWeight: 600 }}>{t.action}</span>
                      </td>

                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="track-split">
        <div className="panel">
          <div className="panel-head">
            <h2>Cash Position Analysis (Actual vs Predicted)</h2>
            <span className="hint">{isAll ? `All branches (${tracks.length})` : selected?.name}</span>
          </div>
          <div className="panel-body">
            {dataLoading ? (
              <Skeleton height={220} radius={10} />
            ) : (
              trendData.length > 0 && <TrendChart data={trendData} height={220} splitActualPredicted />
            )}
            <div className="trend-caption">Solid = Actual · Dashed = Predicted (Deposit · Withdrawal · Net)</div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Delivery Plan by Denomination</h2>
            <span className="hint"><span style={{color: COLOR.accent}}>■</span> Actual (d-1) + <span style={{color: COLOR.amber}}>■</span> Delivery Plan (d)</span>
          </div>
          <div className="panel-body">
            {dataLoading ? <Skeleton height="100%" radius={10} style={{ flex: 1, minHeight: 220 }} /> : <DenominationGap data={isAll ? summary.denominationGap : (selected?.denominationGap ?? summary.denominationGap)} height={220} />}
          </div>
        </div>
      </div>
    </div>
  );
}
