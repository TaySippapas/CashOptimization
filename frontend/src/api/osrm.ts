// Fetch real road-following route geometry from a public OSRM server.
// Results are cached in memory AND localStorage so routes reliably render
// as actual roads (and survive reloads / rate-limits). Falls back to the
// straight-line path only if every attempt fails.

import { OSRM_CACHE_KEY as STORAGE_KEY } from "@/storage/keys";

type LL = [number, number]; // [lat, lng]

const cache = new Map<string, LL[]>();
const inflight = new Map<string, Promise<LL[]>>();

// Public OSRM endpoints — try in order (the demo server rate-limits).
const OSRM_BASES = [
  "https://router.project-osrm.org/route/v1/driving",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving",
];

// ---- Hydrate the persistent cache once on load ----
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const obj = JSON.parse(raw) as Record<string, LL[]>;
    for (const k of Object.keys(obj)) cache.set(k, obj[k]);
  }
} catch {
  /* ignore */
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const obj: Record<string, LL[]> = {};
      cache.forEach((v, k) => (obj[k] = v));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      /* quota — drop persistence silently */
    }
  }, 400);
}

function keyOf(path: LL[]): string {
  return path.map((p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join(";");
}

/** Synchronous cache lookup — lets components render roads immediately. */
export function getCachedGeometry(path: LL[]): LL[] | null {
  if (path.length < 2) return null;
  return cache.get(keyOf(path)) ?? null;
}

async function fetchFrom(base: string, coords: string): Promise<LL[]> {
  const url = `${base}/${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  const geo: number[][] = data?.routes?.[0]?.geometry?.coordinates ?? [];
  if (!geo.length) throw new Error("OSRM empty geometry");
  return geo.map(([lng, lat]) => [lat, lng]);
}

export async function fetchRoadGeometry(path: LL[]): Promise<LL[]> {
  if (path.length < 2) return path;
  const key = keyOf(path);
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  const coords = path.map(([lat, lng]) => `${lng},${lat}`).join(";");

  const p = (async () => {
    let lastErr: unknown;
    for (const base of OSRM_BASES) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const out = await fetchFrom(base, coords);
          cache.set(key, out);
          persist();
          return out;
        } catch (e) {
          lastErr = e;
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
        }
      }
    }
    throw lastErr ?? new Error("OSRM failed");
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}
