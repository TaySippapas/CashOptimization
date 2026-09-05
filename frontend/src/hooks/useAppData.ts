import type { Dispatch, SetStateAction } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppConfig, BranchTrack, Machine, PlanBundle, RouteExecution } from "@/types";
import type { RouteTrackSummary } from "@/domain/routeExec";

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
  setSelectedDate: Dispatch<SetStateAction<string>>;
  /** The date the backend actually served, whether picked or resolved. */
  resolvedDate: string;
  dateRange?: { minDate?: string; maxDate?: string };
}

export function useAppData(): AppData {
  return useOutletContext<AppData>();
}
