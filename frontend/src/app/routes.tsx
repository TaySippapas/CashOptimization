import { lazy } from "react";
import { Navigate, useLocation, useParams, type RouteObject } from "react-router-dom";
import App from "./App";

const ExecutiveOverviewPage = lazy(() => import("@/pages/overview/ExecutiveOverviewPage"));
const ExecutiveOverviewV2Page = lazy(() => import("@/pages/overview/ExecutiveOverviewV2Page"));
const MachineTrackingPage = lazy(() => import("@/pages/machines/MachineTrackingPage"));
const BranchTrackingPage = lazy(() => import("@/pages/branches/BranchTrackingPage"));
const RouteTrackingPage = lazy(() => import("@/pages/routes/RouteTrackingPage"));
const RouteDetailPage = lazy(() => import("@/pages/routes/[routeId]/RouteDetailPage"));
const RouteConfigPage = lazy(() => import("@/pages/config/RouteConfigPage"));
const OptimizationPage = lazy(() => import("@/pages/optimization/OptimizationPage"));
const AiPerformancePage = lazy(() => import("@/pages/ai-performance/AiPerformancePage"));
const AlertsPage = lazy(() => import("@/pages/alerts/AlertsPage"));
const ScenarioPage = lazy(() => import("@/pages/scenario/ScenarioPage"));
const ReportsPage = lazy(() => import("@/pages/reports/ReportsPage"));
const TrendsPage = lazy(() => import("@/pages/trends/TrendsPage"));

// Keep existing bookmarks working while each trend page belongs to its own tab.
function LegacyTrendsRedirect() {
  const { dataset } = useParams();
  const { search } = useLocation();
  const tab = dataset === "machines" || dataset === "routes" ? dataset : "branches";
  return <Navigate to={`/${tab}/trends${search}`} replace />;
}

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: "overview", element: <ExecutiveOverviewPage /> },
      { path: "overview-v2", element: <ExecutiveOverviewV2Page /> },
      { path: "machines", element: <MachineTrackingPage /> },
      { path: "machines/trends", element: <TrendsPage dataset="machines" /> },
      { path: "branches", element: <BranchTrackingPage /> },
      { path: "branches/trends", element: <TrendsPage dataset="branches" /> },
      { path: "routes", element: <RouteTrackingPage /> },
      { path: "routes/trends", element: <TrendsPage dataset="routes" /> },
      { path: "routes/:routeId", element: <RouteDetailPage /> },
      { path: "route-config", element: <RouteConfigPage /> },
      { path: "optimization", element: <OptimizationPage /> },
      { path: "ai-performance", element: <AiPerformancePage /> },
      { path: "alerts", element: <AlertsPage /> },
      { path: "scenario", element: <ScenarioPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "trends", element: <LegacyTrendsRedirect /> },
      { path: "trends/:dataset", element: <LegacyTrendsRedirect /> },
    ],
  },
];
