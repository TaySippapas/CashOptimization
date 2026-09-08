import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Layers } from "lucide-react";

/** Collapses just the legend; the map and its layers stay visible. */
export default function MapLegend({ children, className = "", description = "Map key" }: { children: ReactNode; className?: string; description?: string }) {
  const [visible, setVisible] = useState(true);
  const contentId = useId();
  return (
    <div className={`map-legend ${className}${visible ? "" : " is-collapsed"}`}>
      <button
        type="button"
        className="map-legend-toggle"
        aria-expanded={visible}
        aria-controls={contentId}
        aria-label={visible ? "Hide legend" : "Show legend"}
        title={visible ? "Hide legend" : "Show legend"}
        onClick={() => setVisible((current) => !current)}
      >
        <span className="map-legend-icon"><Layers size={16} aria-hidden="true" /></span>
        <span className="map-legend-heading">
          <span className="map-legend-title">Legend</span>
          {visible && <span className="map-legend-description">{description}</span>}
        </span>
        <span className="map-legend-chevron"><ChevronDown size={13} aria-hidden="true" /></span>
      </button>
      <div id={contentId} className="map-legend-content" hidden={!visible}>{children}</div>
    </div>
  );
}
