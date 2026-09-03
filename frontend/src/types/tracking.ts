// ---- Machine & Branch tracking ----
export type Health = "Healthy" | "Watch" | "Action Needed" | "Critical" | "No Data";
export type TrackAction = "Deliver" | "Pickup" | "Both" | "No Action";
export type RiskLevel = "Very High" | "High" | "Medium" | "Low";

export interface DayFlow {
  day: string; // "DD MMM"
  deposit: number;
  withdraw: number;
  net: number;
}

export interface Denomination {
  b1000: number;
  b500: number;
  b100: number;
  b50?: number; // machines don't use 50 baht notes
}

export interface DenominationDetail {
  denom: number;           // 1000 | 500 | 100
  actualNotes: number;
  actualThb: number;
  predictedNotes: number;
  predictedThb: number;
  maxNotes: number;        // alltime_max_note_count
  addNotes: number;
  addThb: number;
  removeNotes: number;
  removeThb: number;
}

// Editable machine input (everything else is derived from these).
export interface MachineInput {
  id: string;
  machineType: string;     // RCM | 3IN1 | ATM (future)
  location: string;
  district: string;
  lat: number;
  lng: number;
  currentCash: number;     // THB currently in the machine (d-1)
  predictedEod: number;    // predicted end-of-day cash (d), THB
  cashCapacity: number;    // alltime max cash, THB
  confidence: number | null; // ML confidence % (null = not available)
  addAmount: number;       // replenishment ADD (THB)
  removeAmount: number;    // replenishment REMOVE (THB)
}

export interface Machine extends MachineInput {
  action: TrackAction;
  health: Health;
  riskLevel: RiskLevel;
  emergency: boolean;
  depositToday: number;
  withdrawToday: number;
  denomination: Denomination;
  denominationDetail: DenominationDetail[];
  trend: DayFlow[];
}

export interface BranchTrack {
  code: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  currentCash: number;
  deposit: number; // predicted daily deposit inflow
  withdraw: number; // predicted daily withdrawal outflow
  forecastNet: number; // deposit - withdraw
  predictedCash: number; // server-computed: opening + deposit - withdraw
  fillAmount: number; // delivery amount (0 if no action)
  utilizationPct: number; // opening / capacity * 100
  action: TrackAction;
  health: Health;
  confidence: number;
  emergency: boolean;
  trend: DayFlow[];
  denominationGap: Record<string, number>; // actual + delivery plan per denomination
}
