import { useEffect, useMemo, useRef, useState } from "react";
import { Cpu, PackageOpen, MinusCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import { summarizeMachines, HEALTH_COLOR, machineActionLabel } from "@/domain/tracking";
import type { Machine, DayFlow } from "@/types";
import { thb } from "@/utils/format";
import HealthMap, { type MapPoint } from "@/components/maps/HealthMap";
import TrendChart from "@/components/charts/TrendChart";
import { DenominationDonut } from "@/components/charts/DenominationChart";
import { useAppData } from "@/hooks/useAppData";
import KpiCard, { SkeletonKpiCard } from "@/components/KpiCard";
import StatusDot from "@/components/StatusDot";
import Skeleton from "@/components/Skeleton";
import Pill from "@/components/Pill";
import SortTh from "./_SortTh";
import MachineTypeFilter from "./_MachineTypeFilter";
import DenomTooltip from "./_DenomTooltip";
import { COLOR } from "@/utils/colors";

const ALL_MACHINES = "__all__";

type SortKey = "machine" | "current" | "deposit" | "withdrawal" | "predicted" | "add" | "remove" | "action";
type SortDir = "asc" | "desc";

const ACTION_COLOR: Record<string, string> = {
  "Swap (Near Empty)": COLOR.amber,
  "Swap (Near Full)": COLOR.sky,
  "No Action": COLOR.slate,
};

export default function MachineTrackingPage() {
  const { config, machinesOverride, machineBusinessDate, dataLoading } = useAppData();
  const allMachines = useMemo(() => machinesOverride ?? [], [machinesOverride]);

  // Machine Type multi-select filter
  const availableTypes = useMemo(
    () => [...new Set(allMachines.map((m) => m.machineType).filter(Boolean))].sort(),
    [allMachines]
  );
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const machines = useMemo(
    () => typeFilter.length === 0 ? allMachines : allMachines.filter((m) => typeFilter.includes(m.machineType)),
    [allMachines, typeFilter]
  );

  const [selectedId, setSelectedId] = useState<string>(ALL_MACHINES);
  const [sortKey, setSortKey] = useState<SortKey>("action");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const summary = useMemo(() => summarizeMachines(machines), [machines]);
  const isAll = selectedId === ALL_MACHINES;
  const selected = machines.find((m) => m.id === selectedId) ?? machines[0];

  // Auto-scroll to selected row
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (!isAll && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedId, isAll]);

  // Aggregate trend for "All" view
  const allTrend = useMemo<DayFlow[]>(() => {
    if (!machines.length) return [];
    return machines[0].trend.map((_, i) => {
      const deposit = machines.reduce((s, m) => s + (m.trend?.[i]?.deposit ?? 0), 0);
      const withdraw = machines.reduce((s, m) => s + (m.trend?.[i]?.withdraw ?? 0), 0);
      return { day: machines[0]?.trend?.[i]?.day ?? `Day ${i + 1}`, deposit, withdraw, net: deposit - withdraw };
    });
  }, [machines]);

  const trendData = isAll ? allTrend : selected?.trend ?? [];
  const trendLabel = isAll ? `All machines (${machines.length})` : `${selected?.id} · ${selected?.location}`;

  // Map points with dimming when filtered
  const points: MapPoint[] = machines.map((m) => ({
    id: m.id,
    lat: m.lat,
    lng: m.lng,
    health: m.health,
    emphasize: m.emergency || m.id === selectedId,
    dimmed: !isAll && m.id !== selectedId && !m.emergency,
    title: `${m.id} · ${m.location}`,
    rows: [
      ["Actual Cash (d-1)", thb(m.currentCash)],
      ["Pred. Deposit (d)", thb(m.depositToday)],
      ["Pred. Withdrawal (d)", thb(m.withdrawToday)],
      ["Predicted Cash (d)", thb(m.predictedEod)],
      ["Action", machineActionLabel(m.action)],
      ...(m.emergency ? ([["Emergency", "YES"]] as [string, string][]) : []),
    ],
  }));

  // Sort logic
  const ranked = useMemo(() => {
    const val = (m: Machine): string | number => {
      switch (sortKey) {
        case "machine":
          return m.id;
        case "current":
          return m.currentCash;
        case "deposit":
          return m.depositToday;
        case "withdrawal":
          return m.withdrawToday;
        case "predicted":
          return m.predictedEod;
        case "add":
          return m.addAmount;
        case "remove":
          return m.removeAmount;
        case "action":
          return machineActionLabel(m.action);
      }
    };
    const dir = sortDir === "asc" ? 1 : -1;
    return [...machines].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [machines, sortKey, sortDir]);

  const toggleSort = (col: SortKey) => {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(col);
      setSortDir(col === "action" ? "asc" : "desc");
    }
  };

  return (
    <div className="track-page">
      {/* Page toolbar with filters + date */}
      <div className="page-toolbar">
        <span className="pt-title">Machine Tracking · {machines.length} machines</span>
        <MachineTypeFilter types={availableTypes} selected={typeFilter} onChange={setTypeFilter} />
        <select className="select-inline" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value={ALL_MACHINES}>All machines ({machines.length})</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id} · {m.machineType} · {m.location}
            </option>
          ))}
        </select>
        <span className="pt-date">Date: {machineBusinessDate || config.params.planDate}</span>
      </div>

      {/* KPI cards — 6 */}
      <div className="kpi-grid track-kpis six">
        {dataLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonKpiCard key={i} />)
        ) : (
          <>
            <KpiCard
              icon={<Cpu size={18} color={COLOR.accent} />}
              label="Total machines"
              value={String(summary.total)}
            />
            <KpiCard
              icon={<PackageOpen size={18} color={COLOR.sky} />}
              label="Swap (Near Full)"
              value={String(summary.pickup)}
              tone="amber"
            />
            <KpiCard
              icon={<PackageOpen size={18} color={COLOR.amber} />}
              label="Swap (Near Empty)"
              value={String(summary.deliver)}
            />
            <KpiCard
              icon={<ShieldCheck size={18} color={COLOR.green} />}
              label="Healthy"
              value={String(summary.healthy)}
              tone="green"
            />
            <KpiCard
              icon={<MinusCircle size={18} color={COLOR.slate} />}
              label="No Action"
              value={String(summary.noAction)}
            />
            <KpiCard
              icon={<AlertTriangle size={18} color={COLOR.red} />}
              label="Emergency"
              value={String(summary.emergency)}
              tone="danger"
            />
          </>
        )}
      </div>

      {/* Row 1: Map + Table */}
      <div className="track-split">
        <div className="panel" style={dataLoading ? { display: "flex", flexDirection: "column" } : undefined}>
          <div className="panel-head">
            <h2>Machine Health Map</h2>
            <span className="hint">{machines.length} machines · emphasized = selected / emergency</span>
          </div>
          {dataLoading ? (
            <Skeleton height="100%" radius={0} style={{ flex: 1, minHeight: 430 }} />
          ) : (
            <HealthMap points={points} showEmergencyLegend />
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Machine Summary</h2>
            <span className="hint">actual cash · predicted flows · service plan</span>
          </div>
          <div className="panel-body" style={{ padding: 0, maxHeight: 430, overflowY: "auto" }}>
            <table className="branch-table">
              <thead>
                <tr>
                  <SortTh label="Machine" col="machine" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Actual Cash (d-1)" col="current" num sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Pred. Deposit (d)" col="deposit" num sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Pred. Withdrawal (d)" col="withdrawal" num sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Predicted Cash (d)" col="predicted" num sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Add" col="add" num sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Remove" col="remove" num sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Action" col="action" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {dataLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td><Skeleton width="80%" height={12} style={{ marginBottom: 4 }} /><Skeleton width="55%" height={10} /></td>
                      <td className="num"><Skeleton width={70} height={11} style={{ marginLeft: "auto" }} /></td>
                      <td className="num"><Skeleton width={60} height={11} style={{ marginLeft: "auto" }} /></td>
                      <td className="num"><Skeleton width={60} height={11} style={{ marginLeft: "auto" }} /></td>
                      <td className="num"><Skeleton width={70} height={11} style={{ marginLeft: "auto" }} /></td>
                      <td className="num"><Skeleton width={50} height={11} style={{ marginLeft: "auto" }} /></td>
                      <td className="num"><Skeleton width={50} height={11} style={{ marginLeft: "auto" }} /></td>
                      <td><Skeleton width={90} height={12} /></td>
                    </tr>
                  ))
                  : ranked.map((m) => (
                    <tr
                      key={m.id}
                      ref={m.id === selectedId ? selectedRowRef : undefined}
                      onClick={() => setSelectedId(m.id)}
                      style={{ cursor: "pointer", background: m.id === selectedId ? "rgba(56,189,248,0.12)" : undefined }}
                    >
                      <td>
                        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                          <StatusDot color={HEALTH_COLOR[m.health]} />
                          {m.id}
                          <Pill color={COLOR.slate}>{m.machineType}</Pill>
                          {m.emergency && <AlertTriangle size={12} color={COLOR.red} />}
                        </div>
                        <div style={{ color: "var(--muted)", fontSize: 10, paddingTop: 2 }}>{m.location}</div>
                      </td>
                      <td className="num">{thb(m.currentCash)}</td>
                      <td className="num" style={{ color: COLOR.green }}>{thb(m.depositToday)}</td>
                      <td className="num" style={{ color: COLOR.amber }}>{thb(m.withdrawToday)}</td>
                      <td className="num">{thb(m.predictedEod)}</td>
                      <td className="num" style={{ color: m.addAmount > 0 ? COLOR.green : undefined }}>
                        {m.addAmount > 0 ? thb(m.addAmount) : "—"}
                      </td>
                      <td className="num" style={{ color: m.removeAmount > 0 ? COLOR.red : undefined }}>
                        {m.removeAmount > 0 ? thb(m.removeAmount) : "—"}
                        {(m.addAmount > 0 || m.removeAmount > 0) && (
                          <span style={{ marginLeft: 4 }}><DenomTooltip detail={m.denominationDetail} /></span>
                        )}
                      </td>
                      <td>
                        <span style={{ color: ACTION_COLOR[machineActionLabel(m.action)], fontWeight: 600 }}>
                          {machineActionLabel(m.action)}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 2: Trend + Denomination */}
      <div className="track-split">
        <div className="panel">
          <div className="panel-head">
            <h2>Cash Position Analysis (Actual vs Predicted)</h2>
            <span className="hint">{trendLabel}</span>
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

        <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
          <div className="panel-head">
            <h2>Predicted Denomination Mix (d)</h2>
            <span className="hint">{isAll ? "All machines" : `${selected?.id} · ${selected?.location}`}</span>
          </div>
          <div className="panel-body" style={{ flex: 1, minHeight: 0, display: "flex" }}>
            {dataLoading ? (
              <Skeleton width="auto" height="80%" radius={999} style={{ aspectRatio: 1, margin: "auto" }} />
            ) : (
              selected && <DenominationDonut data={selected.denomination} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
