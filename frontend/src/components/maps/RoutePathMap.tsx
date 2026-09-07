import { MapContainer, TileLayer, Marker, Popup, ZoomControl } from "react-leaflet";
import L from "leaflet";
import type { RouteExecution } from "@/types";
import { thb } from "@/utils/format";
import { useTileUrl } from "@/hooks/useTheme";
import { RoadPolyline, FitBounds, depotIcon } from "./map.utils";
import { STOP_STATUS_COLOR, STOP_TYPE_COLOR } from "@/domain/routeExec";

function stopIcon(color: string, ring: string, seq: number) {
  return L.divIcon({
    className: "",
    html: `<div class="marker-badge" style="width:26px;height:26px;background:${color};box-shadow:0 0 0 3px ${ring}">${seq}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export default function RoutePathMap({ exec }: { exec: RouteExecution }) {
  const tileUrl = useTileUrl();
  const service = exec.stops.filter((s) => s.type !== "Start" && s.type !== "Return");
  const points: [number, number][] = exec.path;
  return (
    <div className="health-map">
      {/* zoom sits top-right: the stop legend occupies the top-left corner */}
      <MapContainer center={[exec.depotLat, exec.depotLng]} zoom={11} scrollWheelZoom zoomControl={false}>
        <ZoomControl position="topright" />
        <FitBounds points={points} padding={50} />
        <TileLayer key={tileUrl} attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ" url={tileUrl} />
        <RoadPolyline path={exec.path} color={exec.color} />
        {service.map((s) => (
          <Marker key={`${s.routeId ?? exec.routeId}-${s.seq}`} position={[s.lat, s.lng]} icon={stopIcon(STOP_TYPE_COLOR[s.type], STOP_STATUS_COLOR[s.status], s.seq)}>
            <Popup>
              <div className="popup">
                <div className="p-title">{s.seq}. {s.location}</div>
                <div className="p-row"><span className="lab">Type</span><span>{s.type === "Deliver" ? "Delivery" : s.type === "Mixed" ? "Both (Delivery + Pickup)" : s.type}</span></div>
                <div className="p-row"><span className="lab">Status</span><span>{s.status}</span></div>
                <div className="p-row"><span className="lab">ETA</span><span>{s.eta}</span></div>
                <div className="p-row"><span className="lab">Amount</span><span>{s.amount >= 0 ? "+" : "−"}{thb(Math.abs(s.amount))}</span></div>
              </div>
            </Popup>
          </Marker>
        ))}
        <Marker position={[exec.depotLat, exec.depotLng]} icon={depotIcon(28)}>
          <Popup>
            <div className="popup">
              <div className="p-title">{exec.depot}</div>
              <div className="p-row"><span className="lab">Role</span><span>Depot / Cash Center</span></div>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
      <div className="map-legend-left map-legend route-detail-legend">
        <div className="legend-group-label">Stop type</div>
        <div className="row"><span className="dot" style={{ background: STOP_TYPE_COLOR.Deliver }} /> Delivery</div>
        <div className="row"><span className="dot" style={{ background: STOP_TYPE_COLOR.Pickup }} /> Pickup</div>
        <div className="row"><span className="dot" style={{ background: STOP_TYPE_COLOR.Mixed }} /> Both (Delivery + Pickup)</div>
        <div className="row"><span className="dot emergency-dot" /> Emergency Stop</div>
        <div className="legend-group-label">Stop status</div>
        <div className="row"><span className="dot" style={{ background: STOP_STATUS_COLOR.Completed }} /> Completed</div>
        <div className="row"><span className="dot" style={{ background: STOP_STATUS_COLOR["In Progress"] }} /> In Progress</div>
        <div className="row"><span className="dot" style={{ background: STOP_STATUS_COLOR.Pending }} /> Pending</div>
        <div className="legend-group-label">Route</div>
        <div className="row"><span className="line" style={{ borderColor: exec.color }} /> Route path</div>
        <div className="row"><span className="dot depot-legend-dot" /> Depot</div>
      </div>
    </div>
  );
}
