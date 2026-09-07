// ---- Route execution / tracking (UC fact_route_summary + fact_route_stop) ----
export type RouteStatus = "On Track" | "Delayed" | "At Risk";
export type StopType = "Start" | "Deliver" | "Pickup" | "Mixed" | "Return";
export type StopCategory = "Depot" | "Branch" | "ATM" | "RCM" | "3IN1" | "Other Bank" | "";
export type StopStatus = "Completed" | "In Progress" | "Pending";

export interface RouteStopExec {
  seq: number;
  // Set only when stops from several routes are merged into one list: seq
  // restarts at 1 per route, so it alone cannot identify a stop in that view.
  routeId?: string;
  code: string;          // machine_code or branch_code (comma-sep for merged)
  location: string;
  type: StopType;        // mapped from action_type: Start/Deliver/Pickup/Return
  status: StopStatus;
  eta: string;           // arrival time "HH:MM:SS"
  lat: number;
  lng: number;
  amount: number;        // signed THB: deliveryAmount - pickupAmount
  // UC-enriched fields (present when data comes from backend)
  category?: StopCategory; // stop_type: ATM/Branch/RCM/3IN1/Depot/Other Bank
  actionType?: string;    // raw action_type: START/DELIVERY/RETURN
  etd?: string;           // departure time "HH:MM:SS"
  deliveryAmount?: number; // THB delivered at this stop
  pickupAmount?: number;  // THB collected at this stop
  legKm?: number;         // distance from previous stop
  cumulativeKm?: number;  // cumulative distance from depot
}

export interface RouteExecution {
  routeId: string;       // = truckId (vehicle_code, e.g. "K-211")
  truckId: string;
  plateNumber?: string;  // plate from dim_truck (e.g. "ตส-249")
  label: string;         // display label (= truckId)
  status: RouteStatus;
  depot: string;
  depotLat: number;
  depotLng: number;
  totalStops: number;
  completed: number;
  remaining: number;
  distanceKm: number;
  distanceLeftKm: number;
  etaReturn: string;
  vehicleCapacity: number;
  cashOnBoard: number;
  pickupAmount: number;
  deliveryAmount: number;
  color: string;
  path: [number, number][];
  stops: RouteStopExec[];
  // UC-enriched fields (present when data comes from backend)
  durationMinutes?: number;
  etdStart?: string;
  deliveryBranch?: number;
  deliveryMachine?: number;
  planType?: string;         // OPTIMIZED / ADJUSTED / ACTUAL
  utilizationPct?: number;
  citCostThb?: number;
  costOfTransport?: number;
  slaPct?: number;
  normalHours?: number;
  otHours?: number;
  fuelCost?: number;
  repairCost?: number;
  maintenanceCost?: number;
  normalWage?: number;
  otWage?: number;
  machineStops?: number;
}
