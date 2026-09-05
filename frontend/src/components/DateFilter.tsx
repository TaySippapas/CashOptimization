import { CalendarDays, RotateCcw } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";

/**
 * Business-date filter. Empty selection means "latest" — the backend resolves
 * MAX(business_date) — so the dashboard always opens on the most recent day
 * without the frontend having to know what that date is.
 */
export default function DateFilter() {
  const { selectedDate, setSelectedDate, resolvedDate, dateRange, dataLoading } = useAppData();

  const isLatest = !selectedDate;

  return (
    <div className="date-filter">
      <CalendarDays size={14} className="df-icon" />
      <input
        type="date"
        className="df-input"
        value={selectedDate || resolvedDate || ""}
        min={dateRange?.minDate}
        max={dateRange?.maxDate}
        disabled={dataLoading}
        onChange={(e) => setSelectedDate(e.target.value || "")}
        aria-label="Filter by business date"
      />
      {isLatest ? (
        <span className="df-badge">Latest</span>
      ) : (
        <button
          type="button"
          className="df-reset"
          onClick={() => setSelectedDate("")}
          title="Back to the most recent date"
        >
          <RotateCcw size={12} /> Latest
        </button>
      )}
    </div>
  );
}
