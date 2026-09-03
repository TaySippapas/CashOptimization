import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

function currentTheme(): Theme {
  return (document.documentElement.getAttribute("data-theme") as Theme) || "dark";
}

/** Tracks the active theme by observing the `data-theme` attribute on <html>. */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(currentTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  return theme;
}

const TILES: Record<Theme, string> = {
  dark: "https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  light: "https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
};

/** Returns the Esri tile URL matching the active theme. */
export function useTileUrl(): string {
  return TILES[useTheme()];
}
