import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { fetchDateRange, type TrackingDataset } from "@/api/backend";
import AvailableDatePicker from "./AvailableDatePicker";

/**
 * Business-date filter. Empty selection means "latest" — the backend resolves
 * MAX(business_date) — so the dashboard always opens on the most recent day
 * without the frontend having to know what that date is.
 */
export default function DateFilter({ dataset }: { dataset?: TrackingDataset }) {
  const app = useAppData();
  const scope = dataset ?? "branches";
  const selectedDate = dataset ? app.selectedDates[dataset] : app.selectedDate;
  const resolvedDate = app.businessDates[scope];
  const setSelectedDate = (date: string) => dataset ? app.setDatasetDate(dataset, date) : app.setSelectedDate(date);
  const [availability, setAvailability] = useState<{ dataset: TrackingDataset; dates: string[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setAvailability(null);
    setFailed(false);
    fetchDateRange(scope).then((result) => {
      if (cancelled) return;
      setFailed(!result);
      setAvailability({ dataset: scope, dates: result?.dates ?? [] });
    });
    return () => { cancelled = true; };
  }, [scope, refresh]);
  const dates = availability?.dataset === scope ? availability.dates : [];

  const isLatest = !selectedDate;

  return (
    <div className="date-filter">
      <AvailableDatePicker
        label={`${scope} business date`}
        value={selectedDate || resolvedDate || ""}
        dates={dates}
        disabled={app.dataLoading || availability?.dataset !== scope}
        onChange={(date) => { if (dates.includes(date)) setSelectedDate(date); }}
      />
      {failed && <button type="button" className="df-reset" onClick={() => setRefresh((n) => n + 1)}>Retry dates</button>}
      {isLatest ? (
        <span className="df-badge">Latest</span>
      ) : (
        <button
          type="button"
          className="df-reset"
          disabled={app.dataLoading}
          onClick={() => { setSelectedDate(""); setRefresh((n) => n + 1); }}
          title="Back to the most recent date"
        >
          <RotateCcw size={12} /> Latest
        </button>
      )}
    </div>
  );
}
