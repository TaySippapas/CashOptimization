import { useEffect, useState } from "react";
import { Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { fetchRoadGeometry, getCachedGeometry } from "@/api/osrm";

export function depotIcon(size = 30) {
  return L.divIcon({
    className: "",
    html: `<div class="depot-badge">⌂</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Draws a route that follows real roads (OSRM), falling back to straight legs. */
export function RoadPolyline({
  path,
  color,
  weight = 5,
  opacity = 0.95,
  dashArray,
}: {
  path: [number, number][];
  color: string;
  weight?: number;
  opacity?: number;
  dashArray?: string;
}) {
  const [geo, setGeo] = useState<[number, number][]>(() => getCachedGeometry(path) ?? path);
  const key = path.map((p) => p.join(",")).join(";");

  useEffect(() => {
    let alive = true;
    setGeo(getCachedGeometry(path) ?? path); // roads if cached, else straight while loading
    fetchRoadGeometry(path)
      .then((g) => {
        if (alive && g.length) setGeo(g);
      })
      .catch(() => {
        /* keep straight-line fallback */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <Polyline positions={geo} pathOptions={{ color, weight, opacity, dashArray }} />;
}

export function FitBounds({
  points,
  padding = 70,
}: {
  points: [number, number][];
  padding?: number;
}) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (points.length === 1) {
      map.setView(points[0], 12);
    } else if (points.length > 1) {
      map.fitBounds(points, { padding: [padding, padding] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}
