import { useEffect, useState } from "react";
import { ArrowLeft, ChartNoAxesCombined, RefreshCw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchDateRange, type TrackingDataset } from "@/api/backend";
import { fetchTrends } from "@/api/trends";
import AvailableDatePicker from "@/components/AvailableDatePicker";
import { TREND_DATASETS, TREND_PERIODS, type TrendData } from "@/domain/trends";
import { trendChange, trendDate, trendRollup, trendValue } from "@/utils/trends";
import TrendChart from "./_TrendChart";

export default function TrendsPage({ dataset }: { dataset: TrackingDataset }) {
  return <DatasetTrends key={dataset} dataset={dataset} />;
}

function DatasetTrends({ dataset }: { dataset: TrackingDataset }) {
  const [params, setParams] = useSearchParams();
  const period = TREND_PERIODS.find((item) => item.key === params.get("period")) ?? TREND_PERIODS[1];
  const end = params.get("end") ?? "";
  const requestKey = `${dataset}/${period.key}/${end}`;
  const [result, setResult] = useState<{ key: string; data?: TrendData; error?: string }>();
  const [dates, setDates] = useState<string[]>();
  const [dateError, setDateError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [group, setGroup] = useState("All metrics");
  const data = result?.key === requestKey ? result.data : undefined;
  const error = result?.key === requestKey ? result.error : undefined;

  useEffect(() => {
    let active = true;
    setDateError(false);
    fetchDateRange(dataset).then((range) => {
      if (!active) return;
      setDates(range?.dates ?? []);
      setDateError(!range);
    });
    return () => { active = false; };
  }, [dataset, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    fetchTrends(dataset, period.key, end, controller.signal).then((response) => {
      if (!controller.signal.aborted) setResult({ key: requestKey, data: response });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key: requestKey, error: "Trends could not be loaded. Please retry." });
    });
    return () => controller.abort();
  }, [dataset, period.key, end, requestKey, retry]);

  function update(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    setParams(next);
  }
  const groups = [...new Set(data?.metrics.map((metric) => metric.group) ?? [])];
  const filtered = data?.metrics.filter((metric) => group === "All metrics" || group === metric.group) ?? [];
  const featured = dataset === "routes" ? ["transportCost", "distance", "stops", "utilization"] : ["openingCash", "forecastNet", "serviceRate", "costOfFund"];

  return <div className="trends-page">
    <Link className="trend-back" to={`/${dataset}`}><ArrowLeft size={15} /> Back to {TREND_DATASETS[dataset]}</Link>
    <header className="trends-header">
      <div><div className="trends-eyebrow"><ChartNoAxesCombined size={17} /> PERFORMANCE OVER TIME</div><h1>{TREND_DATASETS[dataset]} trends</h1><p>Explore daily movement across all {dataset === "routes" ? "planned routes" : dataset}.</p></div>
    </header>
    <div className="trends-controls">
      <div className="trend-periods" aria-label="Trend range">{TREND_PERIODS.map((item) => <button key={item.key} type="button" aria-pressed={item.key === period.key} onClick={() => update("period", item.key)}>{item.label}</button>)}</div>
      <div className="trend-end-date"><span>Ending</span><AvailableDatePicker dates={dates ?? []} disabled={dates === undefined} value={end || data?.end || dates?.[dates.length - 1] || ""} label="trend end date" onChange={(value) => update("end", value)} /><button type="button" onClick={() => update("end", "")} disabled={!end}>Latest</button></div>
    </div>
    {dateError && <p role="alert">Available dates could not be loaded. <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>}
    {!data && !error && <div className="trend-state" role="status"><RefreshCw size={22} className="trend-loading-icon" /> Loading {period.days} days of trends…</div>}
    {error && <div className="trend-state" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
    {data && <>
      <div className="trend-range-summary"><div><strong>{trendDate(data.start)} — {trendDate(data.end)}</strong><p>Compared with {trendDate(data.previousStart)} — {trendDate(data.previousEnd)}</p></div><span>{data.coveredDays}/{data.periodDays} snapshot days · Rolling {data.periodDays}-day range</span></div>
      {data.coveredDays === 0 && <div className="trend-notice">No planning snapshots in this range. Choose another available end date.</div>}
      <div className="trend-kpis">{featured.map((key) => data.metrics.find((metric) => metric.key === key)!).map((metric) => <article className="trend-kpi" key={metric.key}>
        <span>{metric.label}</span><strong>{trendValue(metric.value, metric.unit, true)}</strong><small>{trendRollup(metric)} · {metric.coveredDays}/{data.periodDays} days</small>
        <div className="trend-kpi-change">{trendChange(metric)} <span>{metric.change === null ? "Comparison unavailable" : "vs previous period"}</span></div>
      </article>)}</div>
      <div className="trend-notice"><strong>Reading these trends</strong><p>Balances and entity counts use daily averages; cash movements and costs use totals. Rates use the combined numerator and denominator. Rate changes are percentage points (60% → 65% = +5 pp).</p><p>Missing data stays blank. Partial periods show available values and day coverage; comparisons require complete periods. Percentage change is unavailable when the previous value is zero or negative.</p><p>{dataset === "routes" ? "Routes show optimized plans, not confirmed execution. Reported SLA is a mean of recorded route percentages." : "Actual cash flows are counted once per entity and day. Forecasts come from each day's cash position. Opening cash and denomination balances refer to the day before the planning date; utilization uses current capacity."}</p></div>
      <div className="trend-group-filter" aria-label="Metric groups">{["All metrics", ...groups].map((name) => <button type="button" key={name} aria-pressed={name === group} onClick={() => setGroup(name)}>{name}</button>)}</div>
      <div className="trend-chart-grid">{groups.filter((name) => group === "All metrics" || group === name).map((name) => <TrendChart key={name} group={name} metrics={data.metrics.filter((metric) => metric.group === name)} points={data.points} />)}</div>
      <section className="trend-table-panel"><h2>Period breakdown</h2><p>Chart points are daily values. This table summarizes each full selected range. Click a chart legend to hide or show a series.</p>
        <div className="trend-table-scroll"><table><thead><tr><th scope="col">Metric</th><th scope="col">Calculation</th><th scope="col">Selected period</th><th scope="col">Previous period</th><th scope="col">Change</th><th scope="col">Days: selected / previous</th></tr></thead><tbody>{filtered.map((metric) => <tr key={metric.key}><th scope="row">{metric.label}{metric.note && <small>{metric.note}</small>}</th><td>{trendRollup(metric)}</td><td>{trendValue(metric.value, metric.unit)}</td><td>{trendValue(metric.previousValue, metric.unit)}</td><td>{trendChange(metric)}</td><td>{metric.coveredDays}/{data.periodDays} · {metric.previousCoveredDays}/{data.periodDays}</td></tr>)}</tbody></table></div>
      </section>
    </>}
  </div>;
}
