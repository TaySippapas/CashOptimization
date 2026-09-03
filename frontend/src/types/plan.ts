export type CashStatus = "REPLENISH" | "PICKUP" | "OK";

export interface Branch {
  id: string;
  code: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  isDepot?: boolean;
  // ML model outputs (predicted for the planning day, THB)
  predictedInflow: number;
  predictedOutflow: number;
  // Operational cash state (THB)
  openingCash: number;
  cashCapacity: number;
  minThreshold: number;
  // Derived
  netFlow: number; // inflow - outflow
  projectedClosingCash: number;
  status: CashStatus;
  demand: number; // signed THB: positive = deliver (replenish), negative = pickup excess
  serviceMinutes: number;
  windowStart: string; // "HH:MM"
  windowEnd: string;
}

export interface RouteStop {
  branchId: string;
  seq: number;
  arrival: string; // "HH:MM"
  legDistanceKm: number;
  cumulativeKm: number;
}

export interface VehicleRoute {
  vehicleId: string;
  label: string;
  color: string;
  stops: RouteStop[];
  path: [number, number][]; // ordered coords incl depot at both ends
  totalDistanceKm: number;
  driveMinutes: number;
  serviceMinutes: number;
  cashDelivered: number;
  cashPickedUp: number;
}

export interface RoutePlan {
  kind: "OPTIMIZED" | "ORIGINAL";
  vehicles: VehicleRoute[];
  totalDistanceKm: number;
  totalDriveMinutes: number;
  totalServiceMinutes: number;
  totalManHours: number;
  vehiclesUsed: number;
  branchesServed: number;
}

export interface ExecMetrics {
  distanceSavedKm: number;
  distanceSavedPct: number;
  manHoursSaved: number;
  manHoursSavedPct: number;
  vehiclesSaved: number;
  fuelCostSavedThb: number;
  idleCashBeforeThb: number;
  idleCashAfterThb: number;
  idleCashReductionThb: number;
  idleCashReductionPct: number;
  co2SavedKg: number;
  onTimePct: number;
  branchesServed: number;
  branchesTotal: number;
}

export interface PlanBundle {
  planDate: string;
  region: string;
  branches: Branch[];
  optimized: RoutePlan;
  original: RoutePlan;
  metrics: ExecMetrics;
}

// ---- Dynamic input model ----
// The raw, user-editable inputs. Everything else (status, demand, routes,
// metrics) is DERIVED from these by the plan builder.
export interface BranchInput {
  code: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  isDepot?: boolean;
  cashCapacity: number; // vault capacity (THB)
  minThreshold: number; // minimum operating cash (THB)
  openingCash: number; // start-of-day balance (THB)
  predictedInflow: number; // ML model output (THB)
  predictedOutflow: number; // ML model output (THB)
  serviceMinutes?: number; // dwell time; auto if omitted
  windowStart?: string; // "HH:MM"
  windowEnd?: string; // "HH:MM"
}

export interface OptimizerParams {
  planDate: string;
  region: string;
  numVans: number;
  vanCashCapacity: number; // THB per van (reference)
  roadFactor: number; // straight-line -> road multiplier
  avgSpeedKmh: number;
  costPerKmThb: number;
  co2PerKmKg: number;
  crewPerVehicle: number;
  replenishTargetPct: number; // refill target as % of capacity (e.g. 0.6)
  excessLinePct: number; // pickup trigger as % of capacity (e.g. 0.8)
  keepPct: number; // cash to leave after pickup, % of capacity (e.g. 0.5)
  cityServiceMin: number;
  districtServiceMin: number;
  idleCashResidualPct: number; // % of idle cash still idle after optimization
}

export interface AppConfig {
  params: OptimizerParams;
  branches: BranchInput[];
}
