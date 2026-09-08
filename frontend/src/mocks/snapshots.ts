import { DEFAULT_CONFIG, buildPlanFromConfig } from "./mockData";
import { deriveMachine, generateBranchTracks, generateMachineInputs } from "@/domain/tracking";
import { buildRouteExecutions } from "@/domain/routeExec";
import type { BranchTrack, Machine, RouteExecution, DayFlow } from "@/types";

export function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export const MOCK_END = shiftDate(new Date().toISOString().slice(0, 10), -1);
export const MOCK_DATES = Array.from({ length: 730 }, (_, i) => shiftDate(MOCK_END, i - 729));
export const mockDateRange = { dates: MOCK_DATES, minDate: MOCK_DATES[0], maxDate: MOCK_END };

function random(key: string): number {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}
const money = (amount: number) => Math.round(amount / 1000) * 1000;
const machineInputs = generateMachineInputs().map((m, i) => ({ ...m, machineType: ["ATM", "RCM", "3IN1"][i % 3] }));
const baseBranches = generateBranchTracks(DEFAULT_CONFIG);
const baseRoutes = buildRouteExecutions(buildPlanFromConfig(DEFAULT_CONFIG), DEFAULT_CONFIG.params);

function cash(id: string, capacity: number, day: string, atm = false) {
  const opening = money(capacity * (0.08 + random(`${id}/${day}/open`) * 0.8));
  const deposit = atm ? 0 : money(capacity * (0.015 + random(`${id}/${day}/dep`) * 0.08));
  const withdraw = money(capacity * (0.015 + random(`${id}/${day}/wd`) * 0.08));
  return { opening, deposit, withdraw, closing: opening + deposit - withdraw };
}
function history(id: string, capacity: number, end: string, atm = false): DayFlow[] {
  return Array.from({ length: 14 }, (_, i) => {
    const day = shiftDate(end, i - 13);
    const values = cash(id, capacity, day, atm);
    return { day: new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }), deposit: values.deposit, withdraw: values.withdraw, net: values.deposit - values.withdraw };
  });
}

export function mockBranches(day: string, withHistory = true): BranchTrack[] {
  if (!MOCK_DATES.includes(day)) return [];
  return baseBranches.map((b) => {
    const input = DEFAULT_CONFIG.branches.find((row) => row.code === b.code)!;
    const c = cash(b.code, input.cashCapacity, day);
    const utilization = c.closing / input.cashCapacity;
    const action = utilization < 0.15 ? "Deliver" : utilization > 0.8 ? "Pickup" : "No Action";
    const fillAmount = action === "Deliver" ? money(input.cashCapacity * 0.6 - c.closing) : 0;
    return { ...b, currentCash: c.opening, predictedCash: c.closing, deposit: c.deposit, withdraw: c.withdraw,
      forecastNet: c.deposit - c.withdraw, utilizationPct: c.opening / input.cashCapacity * 100, action, fillAmount,
      health: utilization < 0.05 || utilization > 0.95 ? "Critical" : action !== "No Action" ? "Action Needed" : utilization < 0.3 || utilization > 0.7 ? "Watch" : "Healthy",
      emergency: utilization < 0.05, trend: withHistory ? history(b.code, input.cashCapacity, day) : [],
      denominationGap: { b1000: (c.opening + fillAmount) * 0.6, b500: (c.opening + fillAmount) * 0.25, b100: (c.opening + fillAmount) * 0.1, b50: (c.opening + fillAmount) * 0.05 },
    };
  });
}

export function mockBranchInputs(day: string) {
  const tracks = mockBranches(day, false);
  return DEFAULT_CONFIG.branches.filter((b) => b.isDepot || tracks.some((t) => t.code === b.code)).map((b) => {
    const row = tracks.find((t) => t.code === b.code);
    return row ? { ...b, openingCash: row.currentCash, predictedInflow: row.deposit, predictedOutflow: row.withdraw } : { ...b };
  });
}

export function mockMachines(day: string, withHistory = true): Machine[] {
  if (!MOCK_DATES.includes(day)) return [];
  return machineInputs.map((input) => {
    const c = cash(input.id, input.cashCapacity, day, input.machineType === "ATM");
    const m = deriveMachine({ ...input, currentCash: c.opening, predictedEod: c.closing });
    const addAmount = m.action === "Deliver" ? money(input.cashCapacity * 0.6 - c.closing) : 0;
    const removeAmount = m.action === "Pickup" ? money(c.closing - input.cashCapacity * 0.5) : 0;
    return { ...m, addAmount, removeAmount, depositToday: c.deposit, withdrawToday: c.withdraw,
      trend: withHistory ? history(m.id, m.cashCapacity, day, m.machineType === "ATM") : [],
      denomination: { b1000: 60, b500: 25, b100: 15 },
      denominationDetail: [1000, 500, 100].map((denom, i) => {
        const share = [0.6, 0.25, 0.15][i];
        const actualNotes = Math.floor(c.opening * share / denom);
        const predictedNotes = Math.floor(c.closing * share / denom);
        const addNotes = Math.floor(addAmount * share / denom), removeNotes = Math.floor(removeAmount * share / denom);
        return { denom, actualNotes, actualThb: actualNotes * denom, predictedNotes, predictedThb: predictedNotes * denom,
          maxNotes: Math.floor(m.cashCapacity * share / denom), addNotes, addThb: addNotes * denom, removeNotes, removeThb: removeNotes * denom };
      }),
    };
  });
}

export function mockRoutes(day: string): RouteExecution[] {
  if (!MOCK_DATES.includes(day)) return [];
  return baseRoutes.map((route, i) => {
    const factor = 0.8 + random(`${day}/${route.truckId}`) * 0.4;
    const stops = route.stops.map((stop, index) => ({ ...stop,
      category: stop.type === "Start" || stop.type === "Return" ? "Depot" as const : "Branch" as const,
      actionType: stop.type === "Start" ? "START" : stop.type === "Return" ? "RETURN" : stop.type === "Pickup" ? "PICKUP" : "DELIVERY",
      etd: stop.eta, amount: money(stop.amount * factor),
      deliveryAmount: money(Math.max(0, stop.amount) * factor), pickupAmount: money(Math.max(0, -stop.amount) * factor),
      legKm: index ? route.distanceKm * factor / (route.stops.length - 1) : 0,
      cumulativeKm: index * route.distanceKm * factor / (route.stops.length - 1),
    }));
    const delivery = stops.reduce((sum, stop) => sum + stop.deliveryAmount, 0);
    const pickup = stops.reduce((sum, stop) => sum + stop.pickupAmount, 0);
    const distance = route.distanceKm * factor, hours = 6 + factor * 2;
    const fuel = distance * 5, repair = distance * 1.5, maintenance = distance * 2;
    const normalWage = Math.min(hours, 8) * 250, otWage = Math.max(0, hours - 8) * 375;
    const transport = fuel + repair + maintenance + normalWage + otWage;
    return { ...route, plateNumber: `MOCK-${i + 1}`, label: `Demo ${route.truckId}`, stops,
      distanceKm: distance, distanceLeftKm: distance * route.remaining / Math.max(1, route.totalStops),
      deliveryAmount: delivery, deliveryBranch: delivery, deliveryMachine: 0, pickupAmount: pickup,
      cashOnBoard: delivery + pickup, utilizationPct: (delivery + pickup) / route.vehicleCapacity * 100,
      durationMinutes: hours * 60, etdStart: "08:30", planType: "OPTIMIZED", slaPct: 90 + factor * 5,
      normalHours: Math.min(hours, 8), otHours: Math.max(0, hours - 8), fuelCost: fuel, repairCost: repair,
      maintenanceCost: maintenance, normalWage, otWage, costOfTransport: transport, citCostThb: transport, machineStops: 0,
    };
  });
}

export const mockFleet = baseRoutes.map((route, i) => ({ truckId: route.truckId, centerId: "DEMO-KK", plateNumber: `MOCK-${i + 1}`, cashCapacity: route.vehicleCapacity, isAvailable: true, updatedAt: MOCK_END }));
