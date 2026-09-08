import type { TrackingDataset } from "@/api/backend";
import type { TrendData, TrendMetric, TrendPeriod } from "@/domain/trends";
import { TREND_PERIODS } from "@/domain/trends";
import { DEFAULT_CONFIG } from "./mockData";
import { MOCK_END, MOCK_DATES, mockBranches, mockMachines, mockRoutes, shiftDate } from "./snapshots";
import definitions from "./trendMetrics.json";

type Raw = Record<string, number | null>;
type Definition = Pick<TrendMetric, "key" | "label" | "group" | "unit" | "rollup" | "note"> & { numerator: string | null; denominator: string | null; scale: number };

export function mockDaily(dataset: TrackingDataset, date: string): Raw {
  if (!MOCK_DATES.includes(date)) return {};
  const raw: Raw = {};
  const add = (key: string, value: number) => { raw[key] = (raw[key] ?? 0) + value; };
  if (dataset === "routes") {
    for (const r of mockRoutes(date)) {
      const values = { entities: 1, stops: r.totalStops, completed: r.completed, remaining: r.remaining,
        distance: r.distanceKm, duration: r.durationMinutes! / 60, normalHours: r.normalHours!, otHours: r.otHours!,
        transportCost: r.costOfTransport!, citCost: r.citCostThb!, fuel: r.fuelCost!, repair: r.repairCost!,
        maintenance: r.maintenanceCost!, normalWage: r.normalWage!, otWage: r.otWage!, deliveryBranch: r.deliveryBranch!,
        deliveryMachine: r.deliveryMachine!, pickup: r.pickupAmount, _capacity: r.vehicleCapacity, _load: r.cashOnBoard,
        _slaTotal: r.slaPct!, _slaCount: 1 };
      for (const [key, value] of Object.entries(values)) add(key, value);
    }
    return raw;
  }
  for (const key of ["healthy", "watch", "actionNeeded", "critical", "noData", "deliveryCount", "pickupCount", "bothCount", "noActionCount", "emergencies", "_service", "delivery", "remove"]) raw[key] = 0;
  const rows = dataset === "branches" ? mockBranches(date, false).map((b) => ({ opening: b.currentCash, closing: b.predictedCash, deposit: b.deposit, withdrawal: b.withdraw,
    capacity: DEFAULT_CONFIG.branches.find((input) => input.code === b.code)!.cashCapacity, delivery: b.fillAmount, remove: 0, health: b.health, action: b.action, emergency: b.emergency,
    denoms: [b.currentCash * 0.6, b.currentCash * 0.25, b.currentCash * 0.1, b.currentCash * 0.05] }))
    : mockMachines(date, false).map((m) => ({ opening: m.currentCash, closing: m.predictedEod, deposit: m.depositToday, withdrawal: m.withdrawToday,
      capacity: m.cashCapacity, delivery: m.addAmount, remove: m.removeAmount, health: m.health, action: m.action, emergency: m.emergency,
      denoms: m.denominationDetail.map((d) => d.actualThb) }));
  for (const row of rows) {
    for (const [key, value] of Object.entries({ entities: 1, openingCash: row.opening, predictedCash: row.closing,
      forecastDeposit: row.deposit, forecastWithdrawal: row.withdrawal, forecastNet: row.deposit - row.withdrawal,
      delivery: row.delivery, remove: row.remove, costOfFund: row.opening * 0.02 / 365, _capacity: row.capacity,
      emergencies: Number(row.emergency), _service: Number(row.action !== "No Action") })) add(key, value);
    add(({ Healthy: "healthy", Watch: "watch", "Action Needed": "actionNeeded", Critical: "critical", "No Data": "noData" })[row.health], 1);
    add(({ Deliver: "deliveryCount", Pickup: "pickupCount", Both: "bothCount", "No Action": "noActionCount" })[row.action], 1);
    row.denoms.forEach((value, index) => { add(`denom${[1000, 500, 100, 50][index]}`, value); add("_denomTotal", value); });
    // Demo actuals use the same underlying daily flow; latest planning day has no actual yet.
    if (date < MOCK_END) {
      add("actualEntities", 1); add("actualDeposit", row.deposit); add("actualWithdrawal", row.withdrawal); add("actualNet", row.deposit - row.withdrawal);
    }
  }
  return raw;
}

export function mockRollup(rows: Raw[], metric: Definition): [number | null, number] {
  if (metric.rollup === "ratio") {
    const pairs = rows.map((row) => [row[metric.numerator!], row[metric.denominator!]]).filter((pair): pair is [number, number] => pair[0] != null && pair[1] != null && pair[1] > 0);
    return pairs.length ? [pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.reduce((sum, pair) => sum + pair[1], 0) * metric.scale, pairs.length] : [null, 0];
  }
  const values = rows.map((row) => row[metric.key]).filter((value): value is number => value != null);
  return values.length ? [values.reduce((a, b) => a + b, 0) / (metric.rollup === "average" ? values.length : 1), values.length] : [null, 0];
}

export function mockTrends(dataset: TrackingDataset, period: TrendPeriod, end = MOCK_END): TrendData {
  const days = TREND_PERIODS.find((p) => p.key === period)!.days;
  const start = shiftDate(end, 1 - days), previousEnd = shiftDate(start, -1), previousStart = shiftDate(start, -days);
  const catalog = definitions[dataset] as Definition[];
  const all = Array.from({ length: days * 2 }, (_, i) => {
    const date = shiftDate(previousStart, i);
    const row = mockDaily(dataset, date);
    // Actuals arrive in the next day's snapshot, including when looking back in time.
    if (dataset !== "routes" && date >= end) {
      for (const key of ["actualEntities", "actualDeposit", "actualWithdrawal", "actualNet"]) delete row[key];
    }
    return row;
  });
  const current = all.slice(days), previous = all.slice(0, days);
  const metrics = catalog.map((m): TrendMetric => {
    const [value, coveredDays] = mockRollup(current, m), [previousValue, previousCoveredDays] = mockRollup(previous, m);
    let change: number | null = null;
    if (coveredDays === days && previousCoveredDays === days && value !== null && previousValue !== null) {
      if (m.unit === "%") change = value - previousValue;
      else if (previousValue > 0) change = (value - previousValue) / previousValue * 100;
    }
    return { ...m, value, previousValue, coveredDays, previousCoveredDays, change, changeUnit: m.unit === "%" ? "pp" : "%" };
  });
  return { dataset, period, periodDays: days, start, end, previousStart, previousEnd, availableStart: MOCK_DATES[0], availableEnd: MOCK_END,
    coveredDays: current.filter((row) => row.entities != null).length, metrics,
    points: current.map((row, i) => ({ date: shiftDate(start, i), ...Object.fromEntries(catalog.map((m) => [m.key, mockRollup([row], m)[0]])) })),
  };
}
