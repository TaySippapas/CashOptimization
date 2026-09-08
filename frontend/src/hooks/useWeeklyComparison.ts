import { useEffect, useState } from "react";
import { useAppData } from "./useAppData";
import type { TrackingDataset } from "@/api/backend";
import { fetchComparisonRows, type ComparisonRows } from "@/api/dailyComparison";
import { dailyComparison, weekEarlier } from "@/domain/dailyComparison";

export function useWeeklyComparison<D extends TrackingDataset>(dataset: D) {
  const { selectedDates, businessDates, dataLoading } = useAppData();
  const selectedDate = selectedDates[dataset] || businessDates[dataset];
  const baselineDate = weekEarlier(selectedDate);
  const key = `${dataset}/${baselineDate}`;
  const [result, setResult] = useState<{ key: string; rows: ComparisonRows[D] | null }>();
  useEffect(() => {
    if (!baselineDate || dataLoading) return;
    let active = true;
    fetchComparisonRows(dataset, baselineDate).then((rows) => {
      if (active) setResult({ key, rows });
    }).catch(() => { if (active) setResult({ key, rows: null }); });
    return () => { active = false; };
  }, [dataset, baselineDate, key, dataLoading]);
  const ready = !dataLoading && result?.key === key;
  const rows = ready ? result.rows : null;
  return {
    rows, baselineDate,
    compare: (current: number | null, previous: number | null, better?: "higher" | "lower", unit: "%" | "pp" = "%") =>
      dailyComparison(current, rows === null ? null : previous, baselineDate, { better, unit, loading: Boolean(baselineDate) && !ready }),
  };
}
