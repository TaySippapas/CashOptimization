import type { AppConfig, RouteExecution } from "@/types";
import { deriveMachine, generateBranchTracks } from "./tracking";
import { loadMachines } from "@/storage/machineStore";
import { COLOR } from "@/utils/colors";

export type AlertType = "Machine" | "Branch" | "Route" | "Other";
export type AlertImpact = "Critical" | "High" | "Medium" | "Low";
export type AlertStatus = "New" | "In Progress" | "Acknowledged";

export interface Alert {
  id: string;
  time: string;
  type: AlertType;
  entity: string;
  description: string;
  impact: AlertImpact;
  status: AlertStatus;
}

export interface AlertSummary {
  critical: number;
  high: number;
  medium: number;
  total: number;
  byType: { name: AlertType; value: number; color: string }[];
  byImpact: { name: string; value: number; color: string }[];
  alerts: Alert[];
}

const TYPE_COLOR: Record<AlertType, string> = {
  Machine: COLOR.accent,
  Branch: COLOR.blue,
  Route: COLOR.amber,
  Other: COLOR.green,
};

const IMPACT_COLOR: Record<string, string> = {
  Critical: COLOR.red,
  High: COLOR.orange,
  Medium: COLOR.gold,
  Low: COLOR.green,
};

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickStatus(seed: number, impact: AlertImpact): AlertStatus {
  const rnd = mulberry32(seed);
  const r = rnd();
  if (impact === "Critical" || impact === "High") return r < 0.55 ? "New" : r < 0.85 ? "In Progress" : "Acknowledged";
  if (impact === "Medium") return r < 0.3 ? "New" : r < 0.7 ? "In Progress" : "Acknowledged";
  return r < 0.2 ? "New" : "Acknowledged";
}

function machineImpact(risk: string, health: string): AlertImpact {
  if (risk === "Very High" || health === "Critical") return "Critical";
  if (risk === "High" || health === "Action Needed") return "High";
  if (risk === "Medium" || health === "Watch") return "Medium";
  return "Low";
}

function branchImpact(health: string, emergency: boolean): AlertImpact {
  if (emergency || health === "Critical") return "Critical";
  if (health === "Action Needed") return "High";
  if (health === "Watch") return "Medium";
  return "Low";
}

const TIMES = ["08:15", "08:22", "08:30", "08:35", "08:40", "08:45", "08:50", "08:55", "09:02", "09:08"];

export function buildAlerts(config: AppConfig, execs: RouteExecution[]): AlertSummary {
  const machines = loadMachines().map(deriveMachine);
  const branches = generateBranchTracks(config);
  const alerts: Alert[] = [];
  let t = 0;

  machines
    .filter((m) => m.action !== "No Action")
    .forEach((m) => {
      const impact = machineImpact(m.riskLevel, m.health);
      const desc =
        m.action === "Deliver"
          ? `${m.location} — Low cash / cash-out risk`
          : `${m.location} — Excess cash / overflow risk`;
      alerts.push({
        id: `M-${m.id}`,
        time: TIMES[t++ % TIMES.length],
        type: "Machine",
        entity: m.id,
        description: desc,
        impact,
        status: pickStatus(m.id.charCodeAt(0) * 97, impact),
      });
    });

  branches
    .filter((b) => b.action !== "No Action" || b.emergency || b.health !== "Healthy")
    .forEach((b) => {
      const impact = branchImpact(b.health, b.emergency);
      let desc = "";
      if (b.emergency) desc = `${b.name} — Emergency cash intervention required`;
      else if (b.action === "Deliver") desc = `${b.name} — Cash below minimum threshold`;
      else if (b.action === "Pickup") desc = `${b.name} — Excess cash above threshold`;
      else desc = `${b.name} — Cash position watch`;
      alerts.push({
        id: `B-${b.code}`,
        time: TIMES[t++ % TIMES.length],
        type: "Branch",
        entity: b.code,
        description: desc,
        impact,
        status: pickStatus(b.code.charCodeAt(0) * 53, impact),
      });
    });

  execs.forEach((e) => {
    if (e.status === "Delayed") {
      alerts.push({
        id: `R-${e.routeId}-delay`,
        time: TIMES[t++ % TIMES.length],
        type: "Route",
        entity: e.routeId,
        description: `${e.label} — Delay · traffic / congestion`,
        impact: "High",
        status: "In Progress",
      });
    }
    if (e.status === "At Risk") {
      alerts.push({
        id: `R-${e.routeId}-risk`,
        time: TIMES[t++ % TIMES.length],
        type: "Route",
        entity: e.routeId,
        description: `${e.label} — SLA at risk · ETA slip`,
        impact: "Critical",
        status: "New",
      });
    }
    if (e.remaining > 0 && e.completed < e.totalStops) {
      const skipped = e.stops.find((s) => s.status === "Pending" && s.type !== "Return" && s.type !== "Start");
      if (skipped && e.status === "Delayed") {
        alerts.push({
          id: `R-${e.routeId}-skip`,
          time: TIMES[t++ % TIMES.length],
          type: "Route",
          entity: e.routeId,
          description: `${e.label} — Stop skipped by driver`,
          impact: "High",
          status: "In Progress",
        });
      }
    }
  });

  // Pad with a few synthetic "Other" alerts if total is thin (demo parity with mockup scale)
  const rnd = mulberry32(770707);
  const targetMin = 45;
  while (alerts.length < targetMin) {
    const impacts: AlertImpact[] = ["Medium", "Low", "High"];
    const impact = impacts[Math.floor(rnd() * impacts.length)];
    alerts.push({
      id: `O-${alerts.length}`,
      time: TIMES[t++ % TIMES.length],
      type: "Other",
      entity: "System",
      description: impact === "High" ? "CIT vault reconciliation variance" : "Scheduled maintenance window overlap",
      impact,
      status: pickStatus(alerts.length * 17, impact),
    });
  }

  // Sort: critical first, then by time
  const impactOrder: Record<AlertImpact, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  alerts.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact] || a.time.localeCompare(b.time));

  const critical = alerts.filter((a) => a.impact === "Critical").length;
  const high = alerts.filter((a) => a.impact === "High").length;
  const medium = alerts.filter((a) => a.impact === "Medium").length;

  const typeCounts: Record<AlertType, number> = { Machine: 0, Branch: 0, Route: 0, Other: 0 };
  alerts.forEach((a) => {
    typeCounts[a.type]++;
  });

  const byType = (["Machine", "Branch", "Route", "Other"] as AlertType[])
    .map((name) => ({ name, value: typeCounts[name], color: TYPE_COLOR[name] }))
    .filter((d) => d.value > 0);

  const lowCount = alerts.filter((a) => a.impact === "Low").length;

  const byImpact = (["Critical", "High", "Medium", "Low"] as const).map((name) => ({
    name,
    value: name === "Critical" ? critical : name === "High" ? high : name === "Medium" ? medium : lowCount,
    color: IMPACT_COLOR[name],
  }));

  return {
    critical,
    high,
    medium,
    total: alerts.length,
    byType,
    byImpact,
    alerts,
  };
}

export const IMPACT_STYLE: Record<AlertImpact, string> = {
  Critical: COLOR.red,
  High: COLOR.orange,
  Medium: COLOR.gold,
  Low: COLOR.green,
};

export const STATUS_STYLE: Record<AlertStatus, string> = {
  New: COLOR.red,
  "In Progress": COLOR.amber,
  Acknowledged: COLOR.green,
};
