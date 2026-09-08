import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import type { Health } from "@/types";
import { HEALTH_COLOR } from "@/domain/tracking";
import { useTileUrl } from "@/hooks/useTheme";
import { FitBounds } from "./map.utils";
import MapLegend from "./MapLegend";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  health: Health;
  title: string;
  rows: [string, string][];
  emphasize?: boolean;
  dimmed?: boolean;
  kind?: "machine" | "branch";
}

export default function HealthMap({
  points,
  showEmergencyLegend = false,
  showKindLegend = false,
}: {
  points: MapPoint[];
  showEmergencyLegend?: boolean;
  showKindLegend?: boolean;
}) {
  const tileUrl = useTileUrl();
  return (
    <div className="health-map">
      <MapContainer center={[16.44, 102.83]} zoom={11} scrollWheelZoom>
        <FitBounds points={points.map((p) => [p.lat, p.lng])} padding={50} />
        <TileLayer key={tileUrl} attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ" url={tileUrl} />
        {points.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={p.emphasize ? 10 : p.dimmed ? 5 : p.kind === "branch" ? 7 : 6}
            pathOptions={{
              color: p.emphasize ? "#fff" : p.dimmed ? "transparent" : HEALTH_COLOR[p.health],
              weight: p.emphasize ? 3 : p.dimmed ? 0 : p.kind === "machine" ? 2 : 1,
              fillColor: HEALTH_COLOR[p.health],
              fillOpacity: p.dimmed ? 0.15 : p.kind === "branch" ? 0.75 : 0.85,
              dashArray: p.kind === "machine" ? "2 2" : undefined,
            }}
          >
            <Popup>
              <div className="popup">
                <div className="p-title">{p.title}</div>
                {p.rows.map(([lab, val], i) => (
                  <div className="p-row" key={i}>
                    <span className="lab">{lab}</span>
                    <span>{val}</span>
                  </div>
                ))}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <MapLegend description="Health status">
        {(Object.keys(HEALTH_COLOR) as Health[]).map((h) => (
          <div className="row" key={h}>
            <span className="dot" style={{ background: HEALTH_COLOR[h] }} /> {h}
          </div>
        ))}
        {showKindLegend && (
          <>
            <div className="row legend-sep" />
            <div className="row">
              <span className="dot kind-machine" /> Machine
            </div>
            <div className="row">
              <span className="dot kind-branch" /> Branch
            </div>
          </>
        )}
        {showEmergencyLegend && (
          <div className="row">
            <span className="dot emergency-dot" /> Emergency
          </div>
        )}
      </MapLegend>
    </div>
  );
}
