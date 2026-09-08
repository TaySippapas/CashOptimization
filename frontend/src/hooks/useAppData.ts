import type { Dispatch, SetStateAction } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppConfig, BranchTrack, Machine, PlanBundle, RouteExecution } from "@/types";
import type { RouteTrackSummary } from "@/domain/routeExec";
import type { TrackingDataset } from "@/api/backend";

export interface AppData {
  config: AppConfig;
  setConfig: Dispatch<SetStateAction<AppConfig>>;
  plan: PlanBundle;
  execs: RouteExecution[];
  routeSummary: RouteTrackSummary;
  machinesOverride?: Machine[];
  machineBusinessDate?: string;
  branchTracksOverride?: BranchTrack[];
  dataSourceLabel: string;
  dataLoading: boolean; // check if the data is still loading from the backend
  /** "" means latest — the backend resolves MAX(business_date). */
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedDates: Record<TrackingDataset, string>;
  businessDates: Record<TrackingDataset, string>;
  setDatasetDate: (dataset: TrackingDataset, date: string) => void;
  /** The date the backend actually served, whether picked or resolved. */
  resolvedDate: string;
}

export function useAppData(): AppData {
  return useOutletContext<AppData>();
}
