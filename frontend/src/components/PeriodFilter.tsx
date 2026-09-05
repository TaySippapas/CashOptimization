export type Period = "day" | "week" | "month" | "quarter" | "year";

const OPTIONS: { value: Period; label: string; title: string }[] = [
  { value: "day", label: "1D", title: "Selected day" },
  { value: "week", label: "1W", title: "7 days ending on the selected date" },
  { value: "month", label: "1M", title: "30 days ending on the selected date" },
  { value: "quarter", label: "3M", title: "90 days ending on the selected date" },
  { value: "year", label: "1Y", title: "365 days ending on the selected date" },
];

/**
 * Period range for the overview KPIs. Totals (cost, distance, stops) accumulate
 * across the window; balances and rates are averaged per day, so they stay
 * comparable between periods rather than multiplying by the day count.
 */
export default function PeriodFilter({
  value,
  onChange,
  disabled,
}: {
  value: Period;
  onChange: (p: Period) => void;
  disabled?: boolean;
}) {
  return (
    <div className="period-filter" role="group" aria-label="Aggregation period">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`pf-btn ${value === o.value ? "active" : ""}`}
          onClick={() => onChange(o.value)}
          disabled={disabled}
          title={o.title}
          aria-pressed={value === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
