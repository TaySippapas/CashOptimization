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
}

export function useAppData(): AppData {
  return useOutletContext<AppData>();
}
