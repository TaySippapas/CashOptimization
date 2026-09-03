import type {
  AppConfig,
  BranchTrack,
  DayFlow,
  Denomination,
  Health,
  Machine,
  MachineInput,
  RiskLevel,
  TrackAction,
} from "@/types";
import { computeBranch } from "@/mocks/mockData";
import { COLOR } from "@/utils/colors";

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function money(n: number): number {
  return Math.round(n / 1000) * 1000;
}

const DAY_LABELS = [
  "01 Jul", "02 Jul", "03 Jul", "04 Jul", "05 Jul", "06 Jul", "07 Jul",
  "08 Jul", "09 Jul", "10 Jul", "11 Jul", "12 Jul", "13 Jul", "14 Jul",
];

/** 14-day deposit / withdrawal / net daily trend. */
function genTrend(seed: number, baseDeposit: number, baseWithdraw: number): DayFlow[] {
  const rnd = mulberry32(seed);
  return DAY_LABELS.map((day, i) => {
    const weekend = i % 7 === 5 || i % 7 === 6;
    const wf = weekend ? 0.55 : 1;
    const deposit = money(baseDeposit * wf * (0.75 + rnd() * 0.5));
    const withdraw = money(baseWithdraw * wf * (0.75 + rnd() * 0.5));
    return { day, deposit, withdraw, net: deposit - withdraw };
  });
}

function normDenom(d: Denomination): Denomination {
  const total = d.b1000 + d.b500 + d.b100 + (d.b50 ?? 0) || 1;
  return {
    b1000: Math.round((d.b1000 / total) * 100),
    b500: Math.round((d.b500 / total) * 100),
    b100: Math.round((d.b100 / total) * 100),
    b50: Math.round(((d.b50 ?? 0) / total) * 100),
  };
}

// ---- Machine locations across Khon Kaen (real venues, jittered) ----
const MACHINE_VENUES: { name: string; lat: number; lng: number; district: string; n: number }[] = [
  { name: "Central Plaza Khon Kaen", lat: 16.4515, lng: 102.814, district: "Mueang Khon Kaen", n: 6 },
  { name: "Fairy Plaza", lat: 16.4361, lng: 102.8306, district: "Mueang Khon Kaen", n: 4 },
  { name: "Big C Khon Kaen", lat: 16.4198, lng: 102.8489, district: "Mueang Khon Kaen", n: 4 },
  { name: "Lotus's Khon Kaen", lat: 16.4585, lng: 102.8352, district: "Mueang Khon Kaen", n: 4 },
  { name: "Khon Kaen University", lat: 16.4749, lng: 102.8226, district: "Mueang Khon Kaen", n: 6 },
  { name: "Srinagarind Hospital", lat: 16.4667, lng: 102.8261, district: "Mueang Khon Kaen", n: 3 },
  { name: "Khon Kaen Hospital", lat: 16.4322, lng: 102.8395, district: "Mueang Khon Kaen", n: 3 },
  { name: "KK Bus Terminal 3", lat: 16.4457, lng: 102.8098, district: "Mueang Khon Kaen", n: 2 },
  { name: "KK Railway Station", lat: 16.4386, lng: 102.8296, district: "Mueang Khon Kaen", n: 2 },
  { name: "Ban Phai Market", lat: 16.06, lng: 102.735, district: "Ban Phai", n: 3 },
  { name: "Chum Phae Plaza", lat: 16.543, lng: 102.1, district: "Chum Phae", n: 3 },
  { name: "Nam Phong Market", lat: 16.705, lng: 102.862, district: "Nam Phong", n: 2 },
  { name: "Nong Rua Fresh Market", lat: 16.499, lng: 102.442, district: "Nong Rua", n: 2 },
  { name: "Kranuan Town", lat: 16.71, lng: 103.09, district: "Kranuan", n: 2 },
  { name: "Phu Wiang Market", lat: 16.66, lng: 102.36, district: "Phu Wiang", n: 2 },
];

const MACHINE_CAP = 1_000_000; // RCM cassette capacity, THB

/** The editable machine inputs (raw). Health / action / risk are derived. */
export function generateMachineInputs(): MachineInput[] {
  const rnd = mulberry32(770077);
  const inputs: MachineInput[] = [];
  let counter = 1000;
  for (const v of MACHINE_VENUES) {
    for (let k = 0; k < v.n; k++) {
      counter += 7;
      const lat = v.lat + (rnd() - 0.5) * 0.012;
      const lng = v.lng + (rnd() - 0.5) * 0.012;
      const currentCash = money(MACHINE_CAP * (0.1 + rnd() * 0.85));
      const dailyNet = money((rnd() - 0.5) * 900_000);
      const predictedEod = Math.max(0, currentCash + dailyNet);
      inputs.push({
        id: `RCM-${counter}`,
        machineType: "RCM",
        location: v.n > 1 ? `${v.name} #${k + 1}` : v.name,
        district: v.district,
        lat,
        lng,
        currentCash,
        predictedEod,
        cashCapacity: MACHINE_CAP,
        confidence: Math.round(88 + rnd() * 11),
        addAmount: 0,
        removeAmount: 0,
      });
    }
  }
  return inputs;
}

/** Derive health / action / risk / denomination / trend from an editable input. */
export function deriveMachine(m: MachineInput): Machine {
  const rnd = mulberry32(hashId(m.id));
  const cap = m.cashCapacity || MACHINE_CAP;
  const eod = m.predictedEod;

  let action: TrackAction = "No Action";
  let health: Health = "Healthy";
  let risk: RiskLevel = "Low";
  if (eod < cap * 0.12) {
    action = "Deliver";
    health = eod < cap * 0.06 ? "Critical" : "Action Needed";
    risk = eod < cap * 0.06 ? "Very High" : "High";
  } else if (eod > cap * 0.9) {
    action = "Pickup";
    health = eod > cap * 0.96 ? "Critical" : "Action Needed";
    risk = eod > cap * 0.96 ? "Very High" : "High";
  } else if (eod < cap * 0.2 || eod > cap * 0.82) {
    health = "Watch";
    risk = "Medium";
  }

  const emergency =
    health === "Critical" || (action !== "No Action" && rnd() < 0.18);

  const baseDep = 180_000 + rnd() * 260_000;
  const baseWd = 180_000 + rnd() * 300_000;
  const trend = genTrend(hashId(m.id), baseDep, baseWd);
  const todayFlow = trend[trend.length - 1];

  return {
    ...m,
    action,
    health,
    riskLevel: risk,
    emergency,
    depositToday: todayFlow.deposit,
    withdrawToday: todayFlow.withdraw,
    denomination: normDenom({
      b1000: 55 + rnd() * 15,
      b500: 22 + rnd() * 10,
      b100: 6 + rnd() * 6,
      b50: 3 + rnd() * 4,
    }),
    denominationDetail: [],
    trend,
  };
}

/** Machine-facing action labels for RCM / ATM swap workflows. */
export function machineActionLabel(action: TrackAction): string {
  switch (action) {
    case "Deliver":
      return "Swap (Near Empty)";
    case "Pickup":
      return "Swap (Near Full)";
    default:
      return "No Action";
  }
}

export function generateMachines(): Machine[] {
  return generateMachineInputs().map(deriveMachine);
}

export interface MachineSummary {
  total: number;
  pickup: number;
  deliver: number;
  healthy: number;
  noAction: number;
  emergency: number;
  denominationMix: Denomination;
  trendAll: DayFlow[];
}

export function summarizeMachines(machines: Machine[]): MachineSummary {
  const pickup = machines.filter((m) => m.action === "Pickup").length;
  const deliver = machines.filter((m) => m.action === "Deliver").length;
  const healthy = machines.filter((m) => m.health === "Healthy").length;
  const noAction = machines.filter((m) => m.action === "No Action").length;
  const denomAgg = machines.reduce(
    (a, m) => ({
      b1000: a.b1000 + m.denomination.b1000,
      b500: a.b500 + m.denomination.b500,
      b100: a.b100 + m.denomination.b100,
      b50: (a.b50 ?? 0) + (m.denomination.b50 ?? 0),
    }),
    { b1000: 0, b500: 0, b100: 0, b50: 0 }
  );
  // Use actual trend data from machines (no hardcoded DAY_LABELS)
  const trendLength = machines.length > 0 ? (machines[0]?.trend?.length ?? 0) : 0;
  const trendAll: DayFlow[] = [];
  for (let i = 0; i < trendLength; i++) {
    let deposit = 0;
    let withdraw = 0;
    machines.forEach((m) => {
      deposit += m.trend?.[i]?.deposit ?? 0;
      withdraw += m.trend?.[i]?.withdraw ?? 0;
    });
    trendAll.push({
      day: machines[0]?.trend?.[i]?.day ?? `Day ${i + 1}`,
      deposit,
      withdraw,
      net: deposit - withdraw,
    });
  }
  return {
    total: machines.length,
    pickup,
    deliver,
    healthy,
    noAction,
    emergency: machines.filter((m) => m.emergency).length,
    denominationMix: normDenom(denomAgg),
    trendAll,
  };
}

// ---- Branch tracking (derived from the app config so it stays in sync) ----
export function generateBranchTracks(config: AppConfig): BranchTrack[] {
  const rnd = mulberry32(430043);
  return config.branches
    .filter((b) => !b.isDepot)
    .map((input, i) => {
      const d = computeBranch(input, config.params);
      const action: TrackAction =
        d.status === "REPLENISH" ? "Deliver" : d.status === "PICKUP" ? "Pickup" : "No Action";
      const health: Health =
        d.status === "REPLENISH"
          ? d.projectedClosingCash < d.minThreshold * 0.5
            ? "Critical"
            : "Action Needed"
          : d.status === "PICKUP"
          ? d.projectedClosingCash > d.cashCapacity * 0.92
            ? "Critical"
            : "Action Needed"
          : rnd() < 0.4
          ? "Watch"
          : "Healthy";
      const emergency = d.status !== "OK" && rnd() < 0.18;
      const predictedCash = d.openingCash + d.predictedInflow - d.predictedOutflow;
      const utilizationPct = d.cashCapacity > 0 ? Math.round(d.openingCash / d.cashCapacity * 1000) / 10 : 0;
      const fillAmount = action === "Deliver" ? money(rnd() * 10_000_000) : 0;
      return {
        code: d.code,
        name: d.name,
        district: d.district,
        lat: d.lat,
        lng: d.lng,
        currentCash: d.openingCash,
        deposit: d.predictedInflow,
        withdraw: d.predictedOutflow,
        forecastNet: d.netFlow,
        predictedCash,
        fillAmount,
        utilizationPct,
        action,
        health,
        confidence: Math.round(90 + rnd() * 9),
        emergency,
        trend: genTrend(4000 + i * 13, d.predictedInflow / 4, d.predictedOutflow / 4),
        denominationGap: {
          b1000: money((rnd() - 0.4) * 4_000_000),
          b500: money((rnd() - 0.5) * 2_000_000),
          b100: money((rnd() - 0.55) * 800_000),
          b50: money((rnd() - 0.6) * 400_000),
        },
      };
    });
}

export interface BranchTrackSummary {
  total: number;
  delivery: number;
  pickup: number;
  both: number;
  noAction: number;
  emergency: number;
  trendAll: DayFlow[];
  denominationGap: Record<string, number>;
}

export function summarizeBranchTracks(tracks: BranchTrack[]): BranchTrackSummary {
  const trendAll = tracks[0]
    ? tracks[0].trend.map((_, i) => {
        let deposit = 0;
        let withdraw = 0;
        tracks.forEach((t) => {
          deposit += t.trend[i].deposit;
          withdraw += t.trend[i].withdraw;
        });
        return { day: tracks[0].trend[i].day, deposit, withdraw, net: deposit - withdraw };
      })
    : [];
  const denominationGap = tracks.reduce(
    (a, t) => {
      const g = t.denominationGap as Record<string, number>;
      return {
        b1000: a.b1000 + (g.b1000 ?? 0),
        b500: a.b500 + (g.b500 ?? 0),
        b100: a.b100 + (g.b100 ?? 0),
        b50: a.b50 + (g.b50 ?? 0),
        actual_b1000: a.actual_b1000 + (g.actual_b1000 ?? 0),
        actual_b500: a.actual_b500 + (g.actual_b500 ?? 0),
        actual_b100: a.actual_b100 + (g.actual_b100 ?? 0),
        actual_b50: a.actual_b50 + (g.actual_b50 ?? 0),
      };
    },
    { b1000: 0, b500: 0, b100: 0, b50: 0, actual_b1000: 0, actual_b500: 0, actual_b100: 0, actual_b50: 0 }
  );
  return {
    total: tracks.length,
    delivery: tracks.filter((t) => t.action === "Deliver").length,
    pickup: tracks.filter((t) => t.action === "Pickup").length,
    both: tracks.filter((t) => t.action === "Both").length,
    noAction: tracks.filter((t) => t.action === "No Action").length,
    emergency: tracks.filter((t) => t.emergency).length,
    trendAll,
    denominationGap,
  };
}

export const HEALTH_COLOR: Record<Health, string> = {
  Healthy: COLOR.green,
  Watch: COLOR.gold,
  "Action Needed": COLOR.orange,
  Critical: COLOR.red,
  "No Data": COLOR.slate,
};

export const RISK_COLOR: Record<RiskLevel, string> = {
  "Very High": COLOR.red,
  High: COLOR.orange,
  Medium: COLOR.gold,
  Low: COLOR.green,
};
