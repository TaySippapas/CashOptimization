import { useState } from "react";
import type { Branch, RoutePlan } from "@/types";
import MapView from "@/components/maps/MapView";

export default function ScenarioMapPreview({
  branches,
  optimized,
  original,
}: {
  branches: Branch[];
  optimized: RoutePlan;
  original: RoutePlan;
}) {
  const [showOptimized, setShowOptimized] = useState(true);
  const [showOriginal, setShowOriginal] = useState(false);
  return (
    <MapView
      branches={branches}
      optimized={optimized}
      original={original}
      showOptimized={showOptimized}
      showOriginal={showOriginal}
      onToggleOptimized={() => {
        setShowOptimized(true);
        setShowOriginal(false);
      }}
      onToggleOriginal={() => {
        setShowOptimized(false);
        setShowOriginal(true);
      }}
      compareRouteLabel="Actual"
    />
  );
}
