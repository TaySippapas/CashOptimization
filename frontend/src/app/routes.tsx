import { lazy } from "react";
import { Navigate, type RouteObject } from "react-router-dom";
import App from "./App";

const ExecutiveOverviewPage = lazy(() => import("@/pages/overview/ExecutiveOverviewPage"));
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

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: "overview", element: <ExecutiveOverviewPage /> },
      { path: "machines", element: <MachineTrackingPage /> },
      { path: "branches", element: <BranchTrackingPage /> },
      { path: "routes", element: <RouteTrackingPage /> },
      { path: "routes/:routeId", element: <RouteDetailPage /> },
      { path: "route-config", element: <RouteConfigPage /> },
      { path: "optimization", element: <OptimizationPage /> },
      { path: "ai-performance", element: <AiPerformancePage /> },
      { path: "alerts", element: <AlertsPage /> },
      { path: "scenario", element: <ScenarioPage /> },
      { path: "reports", element: <ReportsPage /> },
    ],
  },
];
