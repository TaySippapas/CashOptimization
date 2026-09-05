import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SPLIT_WIDTH_KEY } from "@/storage/keys";

const MIN_PCT = 28;
const MAX_PCT = 50;
const KEY_STEP = 2;

function readStored(id: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(SPLIT_WIDTH_KEY);
    if (!raw) return fallback;
    const v = (JSON.parse(raw) as Record<string, number>)[id];
    return typeof v === "number" ? Math.min(MAX_PCT, Math.max(MIN_PCT, v)) : fallback;
  } catch {
    return fallback;
  }
}

function persist(id: string, pct: number): void {
  try {
    const raw = localStorage.getItem(SPLIT_WIDTH_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    all[id] = pct;
    localStorage.setItem(SPLIT_WIDTH_KEY, JSON.stringify(all));
  } catch {
    /* private mode / quota — width just won't persist */
  }
}

/**
 * Two-pane layout with a draggable divider. The left pane (the map) is capped
 * at half the width and can be dragged narrower; the right pane takes whatever
 * is left, so shrinking the map widens the detail panel.
 */
export default function ResizableSplit({
  id,
  left,
  right,
  className = "",
}: {
  id: string;
  left: ReactNode;
  right: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState<number>(() => readStored(id, MAX_PCT));
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    persist(id, pct);
  }, [id, pct]);

  const pctFromClientX = useCallback((clientX: number): number => {
    const el = ref.current;
    if (!el) return MAX_PCT;
    const { left: l, width } = el.getBoundingClientRect();
    if (width <= 0) return MAX_PCT;
    const raw = ((clientX - l) / width) * 100;
    return Math.min(MAX_PCT, Math.max(MIN_PCT, Math.round(raw)));
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setPct(pctFromClientX(e.clientX));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === "ArrowLeft" ? -KEY_STEP : e.key === "ArrowRight" ? KEY_STEP : 0;
    if (!delta) return;
    e.preventDefault();
    setPct((p) => Math.min(MAX_PCT, Math.max(MIN_PCT, p + delta)));
  };

  return (
    <div
      ref={ref}
      className={`resizable-split ${dragging ? "is-dragging" : ""} ${className}`}
      style={{ ["--split-left" as string]: `${pct}%` }}
    >
      {left}
      <div
        className="split-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize map"
        aria-valuenow={pct}
        aria-valuemin={MIN_PCT}
        aria-valuemax={MAX_PCT}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={() => setPct(MAX_PCT)}
        title="Drag to resize · double-click to reset"
      >
        <span className="split-grip" />
      </div>
      {right}
    </div>
  );
}
