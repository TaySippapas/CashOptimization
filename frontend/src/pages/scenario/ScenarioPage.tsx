import { useMemo, useState } from "react";
import { Play, Lightbulb, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fmtScenarioValue, scenarioBarPct } from "@/utils/format";
import {
  runScenario,
  SCENARIO_PRESETS,
  DEFAULT_ASSUMPTIONS,
  type ScenarioAssumptions,
  type SimResultRow,
} from "@/domain/scenario";
import { useAppData } from "@/hooks/useAppData";
import DeltaTag from "./_DeltaTag";
import ScenarioAssumptionInput from "./_ScenarioAssumptionInput";
import ScenarioMapPreview from "./_ScenarioMapPreview";
import Skeleton from "@/components/Skeleton";
import { COLOR } from "@/utils/colors";

export default function ScenarioPage() {
  const { config, setConfig, dataLoading } = useAppData();
  const navigate = useNavigate();
  const [presetId, setPresetId] = useState("demand10");
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(DEFAULT_ASSUMPTIONS);
  const [applied, setApplied] = useState<ScenarioAssumptions | null>(DEFAULT_ASSUMPTIONS);
  const [appliedPreset, setAppliedPreset] = useState("demand10");

  const result = useMemo(
    () => (applied ? runScenario(config, applied, appliedPreset) : null),
    [config, applied, appliedPreset]
  );

  const setPreset = (id: string) => {
    setPresetId(id);
    const preset = SCENARIO_PRESETS.find((p) => p.id === id);
    if (preset && Object.keys(preset.assumptions).length) {
      setAssumptions((a) => ({ ...a, ...preset.assumptions }));
    }
  };

  const setField = (key: keyof ScenarioAssumptions, value: number) => {
    setPresetId("custom");
    setAssumptions((a) => ({ ...a, [key]: value }));
  };

  const run = () => {
    setApplied({ ...assumptions });
    setAppliedPreset(presetId);
  };

  return (
    <div className="scenario-page">
      <div className="panel sc-control" style={{ flexDirection: "row" }}>
        <div className="sc-control-field">
          <label>Scenario Type</label>
          <select value={presetId} onChange={(e) => setPreset(e.target.value)} className="select-inline">
            {SCENARIO_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sc-control-field">
          <label>Date</label>
          <input
            type="text"
            readOnly
            value={dataLoading ? "" : config.params.planDate}
            placeholder={dataLoading ? "Loading…" : undefined}
            className="select-inline"
          />
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn primary" onClick={run} disabled={dataLoading}>
          <Play size={15} /> Run Simulation
        </button>
      </div>

      <div className="scenario-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>Scenario Assumptions</h2>
          </div>
          <div className="panel-body sc-assumptions">
            <ScenarioAssumptionInput label="Demand Change" suffix="%" value={assumptions.demandChangePct} onChange={(v) => setField("demandChangePct", v)} signed />
            <ScenarioAssumptionInput label="Cash In Change" suffix="%" value={assumptions.cashInChangePct} onChange={(v) => setField("cashInChangePct", v)} signed />
            <ScenarioAssumptionInput label="Available Trucks" value={assumptions.availableTrucks} onChange={(v) => setField("availableTrucks", v)} />
            <ScenarioAssumptionInput label="Max Route Duration" suffix=" hrs" value={assumptions.maxRouteDurationH} onChange={(v) => setField("maxRouteDurationH", v)} />
            <ScenarioAssumptionInput label="Truck Capacity" value={assumptions.truckCapacityThb} onChange={(v) => setField("truckCapacityThb", v)} money />
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Simulation Results</h2>
            <span className="hint">vs Base Plan</span>
          </div>
          <div className="panel-body sc-results">
            {dataLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                <div className="sc-result-row" key={i}>
                  <Skeleton width={90} height={12} />
                  <Skeleton height={10} radius={999} style={{ flex: 1 }} />
                  <Skeleton width={70} height={12} />
                </div>
              ))
              : result?.rows.map((row) => (
                <div className="sc-result-row" key={row.key}>
                  <span className="sc-result-label">{row.label}</span>
                  <div className="sc-result-track">
                    <div
                      className="sc-result-fill"
                      style={{ width: `${scenarioBarPct(row)}%`, background: row.unit === "pct" ? COLOR.green : COLOR.blue }}
                    />
                  </div>
                  <span className="sc-result-value">
                    {fmtScenarioValue(row)} <DeltaTag row={row} />
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="panel sc-map-panel">
          <div className="panel-head">
            <h2>Map Preview</h2>
            <span className="hint">Delivery · Pickup · Both · Emergency</span>
          </div>
          <div className="sc-map">
            {dataLoading ? (
              <Skeleton height="100%" radius={10} />
            ) : (
              result && (
                <ScenarioMapPreview
                  key={`${appliedPreset}-${result.scenario.optimized.vehiclesUsed}`}
                  branches={result.scenario.branches}
                  optimized={result.scenario.optimized}
                  original={result.scenario.original}
                />
              )
            )}
          </div>
        </div>
      </div>

      {!dataLoading && result && (
        <div className="panel sc-reco">
          <div className="sc-reco-head">
            <Lightbulb size={18} color={COLOR.amber} />
            <h2>Recommendation</h2>
          </div>
          <div className="sc-reco-body">
            {result.additionalTrucks > 0 ? (
              <>
                <p>
                  Under this scenario, you need <strong>{result.additionalTrucks} additional truck{result.additionalTrucks > 1 ? "s" : ""}</strong>{" "}
                  to maintain SLA &gt; 90% (longest route reaches {result.longestRouteH} hrs vs {assumptions.maxRouteDurationH} hr cap).
                </p>
                <p>
                  Or adjust max route duration to <strong>{result.recommendedDurationH} hrs</strong> to keep the same fleet of{" "}
                  {result.vehiclesRequired} vehicle{result.vehiclesRequired > 1 ? "s" : ""}.
                </p>
              </>
            ) : (
              <p>
                The current fleet of <strong>{result.vehiclesRequired} vehicle{result.vehiclesRequired > 1 ? "s" : ""}</strong> absorbs this
                scenario within the {assumptions.maxRouteDurationH} hr shift cap — projected SLA {result.slaScenario}%.
                {!result.feasible && " Note: required vehicles exceed available trucks."}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn primary sc-apply"
            onClick={() => {
              setConfig(result.scenarioConfig);
              navigate("/overview");
            }}
          >
            <Check size={15} /> Apply Scenario
          </button>
        </div>
      )}
    </div>
  );
}
