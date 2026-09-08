import { Suspense, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Sun, Moon, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { AppConfig, BranchInput, BranchTrack, Machine, RouteExecution } from "@/types";
import type { AppData } from "@/hooks/useAppData";
import { buildPlanFromConfig } from "@/mocks/mockData";
import { buildRouteExecutions, summarizeRoutes } from "@/domain/routeExec";
import { loadConfig } from "@/storage/configStore";
import {
  fetchBranchInputsFromApi,
  fetchBranchesFromApi,
  fetchHealth,
  fetchMachinesFromApi,
  fetchRoutesFromApi,
  type TrackingDataset,
} from "@/api/backend";
import { THEME_KEY, NAV_COLLAPSED_KEY } from "@/storage/keys";
import { NAV_ITEMS } from "./nav";
import PageLoader from "@/components/PageLoader";

type Theme = "dark" | "light";

export default function App() {
  const { pathname } = useLocation();
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(THEME_KEY) as Theme) || "dark"
  );
  const [navCollapsed, setNavCollapsed] = useState<boolean>(
    () => localStorage.getItem(NAV_COLLAPSED_KEY) === "1"
  );
  const [ucMachines, setUcMachines] = useState<Machine[] | null>(null);
  const [machineBusinessDate, setMachineBusinessDate] = useState<string>("");
  const [ucBranchTracks, setUcBranchTracks] = useState<BranchTrack[] | null>(null);
  const [ucRoutes, setUcRoutes] = useState<RouteExecution[] | null>(null);
  const [dataSourceLabel, setDataSourceLabel] = useState("Live · loading");
  const [fetchLoading, setDataLoading] = useState(true);
  const [completedRequest, setCompletedRequest] = useState("");
  // "" = latest; the backend resolves MAX(business_date) when no date is sent.
  const [selectedDate, setOverviewDate] = useState<string>("");
  const [selectedDates, setSelectedDates] = useState<Record<TrackingDataset, string>>({ branches: "", machines: "", routes: "" });
  const [businessDates, setBusinessDates] = useState<Record<TrackingDataset, string>>({ branches: "", machines: "", routes: "" });
  const setDatasetDate = (dataset: TrackingDataset, date: string) => {
    setSelectedDates((current) => ({ ...current, [dataset]: date }));
  };
  const setSelectedDate = (date: string) => {
    setOverviewDate(date);
  };
  // The overview has its own cross-dataset filter; tracking pages retain their selections.
  const isOverview = pathname === "/overview" || pathname === "/overview-v2";
  const branchDate = isOverview ? selectedDate : selectedDates.branches;
  const machineDate = isOverview ? selectedDate : selectedDates.machines;
  const routeDate = isOverview ? selectedDate : selectedDates.routes;
  const requestKey = JSON.stringify([branchDate, machineDate, routeDate]);
  const dataLoading = fetchLoading || completedRequest !== requestKey;
  const [resolvedDate, setResolvedDate] = useState<string>("");

  const plan = useMemo(() => buildPlanFromConfig(config), [config]);
  const generatedExecs = useMemo(
    () => buildRouteExecutions(plan, config.params),
    [plan, config.params]
  );
  const liveExecs = ucRoutes ?? generatedExecs;
  const liveRouteSummary = useMemo(
    () => summarizeRoutes(liveExecs),
    [liveExecs]
  );

  const appData: AppData = {
    config,
    setConfig,
    plan,
    execs: liveExecs,
    routeSummary: liveRouteSummary,
    machinesOverride: ucMachines ?? undefined,
    machineBusinessDate: machineBusinessDate || undefined,
    branchTracksOverride: ucBranchTracks ?? undefined,
    dataSourceLabel,
    dataLoading,
    selectedDate,
    setSelectedDate,
    selectedDates,
    businessDates,
    setDatasetDate,
    resolvedDate,
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(NAV_COLLAPSED_KEY, navCollapsed ? "1" : "0");
  }, [navCollapsed]);

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    (async () => {
      // health used to be awaited first, serialising a round trip ahead of the
      // batch; nothing below needs it before the others start.
      const [health, m, b, bi, r] = await Promise.all([
        fetchHealth(),
        fetchMachinesFromApi(machineDate || undefined),
        fetchBranchesFromApi(branchDate || undefined),
        fetchBranchInputsFromApi(branchDate || undefined),
        fetchRoutesFromApi("OPTIMIZED", routeDate || undefined),
      ]);
      if (cancelled) return;

      // Clear stale rows so an empty date doesn't keep showing the old day.
      setUcMachines((m?.machines ?? []) as Machine[]);
      setUcBranchTracks((b?.branches ?? []) as BranchTrack[]);
      setUcRoutes((r?.routes ?? []) as RouteExecution[]);
      setMachineBusinessDate(m?.businessDate ?? "");
      setBusinessDates({ branches: b?.businessDate ?? "", machines: m?.businessDate ?? "", routes: r?.businessDate ?? "" });

      const served = b?.businessDate ?? "";
      setResolvedDate(served);

      if (bi?.branches?.length) {
        setConfig((prev) => ({
          ...prev,
          branches: bi.branches as BranchInput[],
          params: { ...prev.params, planDate: served || prev.params.planDate },
        }));
      }

      if (health?.useUnityCatalog && (m?.machines?.length || b?.branches?.length || r?.routes?.length)) {
        const cat = health.catalog?.split(".").pop() ?? health.catalog ?? "UC";
        setDataSourceLabel(`UC · ${cat}.${health.schema ?? "app"}`);
      } else {
        setDataSourceLabel("Live · no UC data");
      }
      setCompletedRequest(requestKey);
      setDataLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [branchDate, machineDate, routeDate, requestKey]);

  return (
    <div className={`app ${navCollapsed ? "nav-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <div className="logo">
              <img src="/ktb-logo.svg" alt="Krungthai Bank" />
            </div>
            <div className="brand-text">
              <h1>Cash Logistics</h1>
              <div className="sub">Khon Kaen · CVRP-TW</div>
            </div>
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setNavCollapsed((c) => !c)}
            title={navCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-label="Toggle navigation"
          >
            {navCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav className="nav-tabs">
          {NAV_ITEMS.map((t) => {
            const Icon = t.icon;
            return (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`}
                title={t.label}
              >
                <Icon size={18} />
                <span className="nav-label">{t.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <span className="pill" title={dataSourceLabel}>
            <span className="pill-dot">●</span>
            <span className="nav-label">{dataSourceLabel}</span>
          </span>
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </aside>

      <main className="main-col">
        <div className="dash-scroll">
          <Suspense fallback={<PageLoader />}>
            <Outlet context={appData} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
