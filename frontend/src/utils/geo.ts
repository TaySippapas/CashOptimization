import type { Branch } from "@/types";

export const DEFAULT_ROAD_FACTOR = 1.32;
export const DEFAULT_SPEED_KMH = 62;

type LatLng = { lat: number; lng: number };
export type DistFn = (a: LatLng, b: LatLng) => number;

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function makeRoadKm(roadFactor: number): DistFn {
  return (a, b) => haversineKm(a, b) * roadFactor;
}

export function driveMinutes(km: number, speedKmh: number): number {
  return (km / speedKmh) * 60;
}

export function minutesToClock(startMinutes: number): string {
  const m = Math.round(startMinutes);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function routeLength(depot: Branch, seq: Branch[], dist: DistFn): number {
  let total = 0;
  let prev: LatLng = depot;
  for (const s of seq) {
    total += dist(prev, s);
    prev = s;
  }
  total += dist(prev, depot);
  return total;
}

function twoOpt(depot: Branch, seq: Branch[], dist: DistFn): Branch[] {
  let best = [...seq];
  let improved = true;
  let guard = 0;
  while (improved && guard < 40) {
    improved = false;
    guard++;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        if (routeLength(depot, candidate, dist) + 1e-6 < routeLength(depot, best, dist)) {
          best = candidate;
          improved = true;
        }
      }
    }
  }
  return best;
}

/** Nearest-neighbor + 2-opt from the depot. Mimics an OR-Tools per-vehicle path. */
export function orderRoute(depot: Branch, stops: Branch[], dist: DistFn): Branch[] {
  if (stops.length <= 1) return [...stops];
  const remaining = [...stops];
  const ordered: Branch[] = [];
  let current: LatLng = depot;
  while (remaining.length) {
    let bestIdx = 0;
    let bestKm = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = dist(current, remaining[i]);
      if (d < bestKm) {
        bestKm = d;
        bestIdx = i;
      }
    }
    current = remaining[bestIdx];
    ordered.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }
  return twoOpt(depot, ordered, dist);
}

/**
 * Sweep clustering: assign stops to `numVans` vehicles by polar angle around
 * the depot, split into contiguous near-equal groups. Classic VRP heuristic
 * that scales to any vehicle count the user configures.
 */
export function clusterBySweep(depot: Branch, stops: Branch[], numVans: number): Branch[][] {
  const vans = Math.max(1, Math.min(numVans, stops.length || 1));
  if (stops.length === 0) return [];
  const withAngle = stops
    .map((b) => ({ b, angle: Math.atan2(b.lat - depot.lat, b.lng - depot.lng) }))
    .sort((x, y) => x.angle - y.angle);
  const groups: Branch[][] = Array.from({ length: vans }, () => []);
  const per = Math.ceil(withAngle.length / vans);
  withAngle.forEach((item, i) => {
    const g = Math.min(vans - 1, Math.floor(i / per));
    groups[g].push(item.b);
  });
  return groups.filter((g) => g.length > 0);
}

export { routeLength };
