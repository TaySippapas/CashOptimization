import {
  LayoutGrid,
  BarChart3,
  Cpu,
  Building2,
  Route as RouteIcon,
  FileText,
  Settings,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: typeof Cpu;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/overview", label: "Overview", icon: LayoutGrid },
  { to: "/overview-v2", label: "Overview V2", icon: BarChart3 },
  { to: "/machines", label: "Machines", icon: Cpu },
  { to: "/branches", label: "Branches", icon: Building2 },
  { to: "/routes", label: "Route Tracking", icon: RouteIcon },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/route-config", label: "Route Config", icon: Settings },
];
