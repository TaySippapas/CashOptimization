import { useState } from "react";
import { thb } from "@/utils/format";
import { useAppData } from "@/hooks/useAppData";
import MapView from "@/components/maps/MapView";
import RoutePanel from "./_RoutePanel";
import KpiCards from "./_KpiCards";
import ComparisonChart from "@/components/charts/ComparisonChart";
import BranchTable from "./_BranchTable";
import { ReductionBadge } from "@/components/TrendIcon";
import StatBox, { SkeletonStatBox } from "@/components/StatBox";
import { SkeletonKpiCard } from "@/components/KpiCard";
import RibbonStat, { SkeletonRibbonStat } from "./_RibbonStat";
import Skeleton from "@/components/Skeleton";
import { COLOR } from "@/utils/colors";

export default function OptimizationPage() {
  const { config, plan, dataLoading } = useAppData();
  const { branches, optimized, original, metrics } = plan;
  const [showOptimized, setShowOptimized] = useState(true);
  const [showOriginal, setShowOriginal] = useState(true);

  return (
    <>
      <section className="map-hero">
        {dataLoading ? (
          <Skeleton height="100%" radius={0} />
        ) : (
          <MapView
            key={`${branches.length}-${config.params.numVans}`}
            branches={branches}
            optimized={optimized}
            original={original}
            showOptimized={showOptimized}
            showOriginal={showOriginal}
            onToggleOptimized={() => setShowOptimized((s) => !s)}
            onToggleOriginal={() => setShowOriginal((s) => !s)}
          />
        )}

        <div className="kpi-ribbon">
          {dataLoading ? (
            <>
              <SkeletonRibbonStat />
              <SkeletonRibbonStat />
              <SkeletonRibbonStat />
              <SkeletonRibbonStat />
            </>
          ) : (
            <>
              <RibbonStat
                label="Man-hours saved"
                value={`${metrics.manHoursSaved} h`}
                sub={<ReductionBadge pct={metrics.manHoursSavedPct} />}
                accent="#4ade80"
              />
              <RibbonStat
                label="Idle cash freed"
                value={thb(metrics.idleCashReductionThb)}
                sub={<ReductionBadge pct={metrics.idleCashReductionPct} />}
                accent={COLOR.accent}
              />
              <RibbonStat
                label="Distance reduced"
                value={`${metrics.distanceSavedKm} km`}
                sub={<ReductionBadge pct={metrics.distanceSavedPct} />}
                accent={COLOR.accent}
              />
              <RibbonStat
                label="Cost saved / day"
                value={thb(metrics.fuelCostSavedThb)}
                sub={`${metrics.branchesServed}/${metrics.branchesTotal} branches`}
                accent={COLOR.amber}
              />
            </>
          )}
        </div>

        <div className="dispatch-overlay">
          <RoutePanel plan={optimized} branches={branches} loading={dataLoading} />
        </div>
      </section>

      <div className="analytics">
        {dataLoading ? (
          <div className="kpi-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonKpiCard key={i} />
            ))}
          </div>
        ) : (
          <KpiCards m={metrics} />
        )}

        <div className="panel">
          <div className="panel-head">
            <h2>Optimized vs Actual — Operational Comparison</h2>
            <span className="hint">
              {metrics.distanceSavedKm} km &amp; {metrics.manHoursSaved}h saved per cycle
            </span>
          </div>
          <div className="panel-body">
            {dataLoading ? <Skeleton height={120} radius={10} /> : <ComparisonChart optimized={optimized} original={original} />}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 12,
                marginTop: 14,
                fontSize: 12,
              }}
            >
              {dataLoading ? (
                <>
                  <SkeletonStatBox />
                  <SkeletonStatBox />
                  <SkeletonStatBox />
                </>
              ) : (
                <>
                  <StatBox
                    label="Actual plan"
                    value={`${original.totalDistanceKm} km · ${original.vehiclesUsed} van`}
                    accentColor={COLOR.red}
                  />
                  <StatBox
                    label="Optimized plan"
                    value={`${optimized.totalDistanceKm} km · ${optimized.vehiclesUsed} vans`}
                    accentColor={COLOR.green}
                  />
                  <StatBox
                    label="Idle cash freed"
                    value={thb(metrics.idleCashReductionThb)}
                    accentColor={COLOR.accent}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        <BranchTable branches={branches} loading={dataLoading} />
      </div>
    </>
  );
}
