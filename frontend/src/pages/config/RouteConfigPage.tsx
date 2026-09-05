import { useCallback, useEffect, useRef, useState } from "react";
import { Settings, Truck, Clock, DollarSign, Gauge, UtensilsCrossed, Save, Loader2 } from "lucide-react";
import Skeleton from "@/components/Skeleton";
import { COLOR } from "@/utils/colors";

/* ── Types ── */
interface FleetTruck {
  truckId: string;
  centerId: string;
  plateNumber: string;
  cashCapacity: number;
  isAvailable: boolean;
  updatedAt: string;
}
interface RouteParam {
  parameterType: string;
  parameter: string;
  description: string;
  value: number;
  remark: string;
  updatedAt: string;
}

const API = "/api/v2";

const CATEGORY_META: Record<string, { label: string; icon: typeof DollarSign; color: string }> = {
  cost:         { label: "Cost Parameters",         icon: DollarSign,       color: COLOR.amber },
  vehicle:      { label: "Vehicle Parameters",      icon: Truck,            color: COLOR.accent },
  time_window:  { label: "Time Window",             icon: Clock,            color: COLOR.purple },
  service_time: { label: "Service Time",            icon: Gauge,            color: COLOR.green },
  lunch_time:   { label: "Lunch Break",             icon: UtensilsCrossed,  color: "#f97316" },
};

/* ── Page ── */
export default function RouteConfigPage() {
  const [trucks, setTrucks] = useState<FleetTruck[]>([]);
  const [params, setParams] = useState<RouteParam[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Track pending changes
  const [truckChanges, setTruckChanges] = useState<Record<string, boolean>>({});
  const [paramChanges, setParamChanges] = useState<Record<string, number>>({});

  // Values as loaded from the server — an edit back to these is not a change.
  const savedTrucks = useRef<Record<string, boolean>>({});
  const savedParams = useRef<Record<string, number>>({});

  // Raw text while a field is being typed in. Without this, coercing every
  // keystroke to a number makes intermediate input ("0.", "-", "") unwritable.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  /* ── Load data ── */
  useEffect(() => {
    (async () => {
      try {
        const [fRes, pRes] = await Promise.all([
          fetch(`${API}/fleet`).then((r) => r.json()),
          fetch(`${API}/route-params`).then((r) => r.json()),
        ]);
        if (fRes.error) setLoadError((prev) => (prev ? prev + "; " : "") + `Fleet: ${fRes.error}`);
        if (pRes.error) setLoadError((prev) => (prev ? prev + "; " : "") + `Params: ${pRes.error}`);
        const loadedTrucks: FleetTruck[] = fRes.trucks ?? [];
        const loadedParams: RouteParam[] = pRes.params ?? [];
        setTrucks(loadedTrucks);
        setParams(loadedParams);
        savedTrucks.current = Object.fromEntries(loadedTrucks.map((t) => [t.truckId, t.isAvailable]));
        savedParams.current = Object.fromEntries(loadedParams.map((p) => [p.parameter, p.value]));
      } catch (e: any) {
        console.error("Failed to load config", e);
        setLoadError(`Network error: ${e?.message ?? e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ── Toggle truck ── */
  const toggleTruck = useCallback((truckId: string) => {
    const current = trucks.find((t) => t.truckId === truckId);
    if (!current) return;
    const newVal = !current.isAvailable;

    setTrucks((prev) => prev.map((t) =>
      t.truckId === truckId ? { ...t, isAvailable: newVal } : t
    ));
    setTruckChanges((prev) => {
      const next = { ...prev };
      // Toggling back to the saved value cancels the pending change.
      if (newVal === savedTrucks.current[truckId]) delete next[truckId];
      else next[truckId] = newVal;
      return next;
    });
  }, [trucks]);

  /* ── Edit param ── */
  const editParam = useCallback((parameter: string, value: number) => {
    setParams((prev) => prev.map((p) =>
      p.parameter === parameter ? { ...p, value } : p
    ));
    setParamChanges((prev) => {
      const next = { ...prev };
      if (value === savedParams.current[parameter]) delete next[parameter];
      else next[parameter] = value;
      return next;
    });
  }, []);

  /* ── Save all changes ── */
  const saveAll = useCallback(async () => {
    setSaving(true);
    try {
      const promises: Promise<unknown>[] = [];
      for (const [truckId, isAvailable] of Object.entries(truckChanges)) {
        promises.push(
          fetch(`${API}/fleet/availability`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ truckId, isAvailable }),
          })
        );
      }
      for (const [parameter, value] of Object.entries(paramChanges)) {
        promises.push(
          fetch(`${API}/route-params`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parameter, value }),
          })
        );
      }
      await Promise.all(promises);
      // What we just wrote is the new server state, so it becomes the baseline.
      savedTrucks.current = { ...savedTrucks.current, ...truckChanges };
      savedParams.current = { ...savedParams.current, ...paramChanges };
      const saved = Object.keys(truckChanges).length + Object.keys(paramChanges).length;
      setTruckChanges({});
      setParamChanges({});
      setToast(`Saved ${saved} changes`);
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setToast("Save failed — please retry");
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSaving(false);
    }
  }, [truckChanges, paramChanges]);

  /* ── Group params by type ── */
  const grouped = params.reduce<Record<string, RouteParam[]>>((acc, p) => {
    (acc[p.parameterType] ??= []).push(p);
    return acc;
  }, {});

  const availableCount = trucks.filter((t) => t.isAvailable).length;
  const changesCount = Object.keys(truckChanges).length + Object.keys(paramChanges).length;
  const dirty = changesCount > 0;

  return (
    <div className="track-page">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Settings size={22} color={COLOR.accent} />
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Route Configuration</h1>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>
            Adjust fleet availability &amp; optimization parameters
          </span>
        </div>
        <button
          type="button"
          className="btn primary"
          disabled={!dirty || saving}
          onClick={saveAll}
          style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 120 }}
        >
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          {saving ? "Saving..." : `Save${changesCount ? ` (${changesCount})` : ""}`}
        </button>
      </div>

      {/* Error banner */}
      {loadError && (
        <div style={{
          padding: "10px 16px", marginBottom: 12, borderRadius: 8,
          background: "rgba(239,68,68,0.15)", border: "1px solid #ef4444",
          color: "#fca5a5", fontSize: 12,
        }}>
          ⚠️ {loadError}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 999,
          background: toast.includes("failed") ? "#ef4444" : COLOR.green,
          color: "#fff", padding: "10px 20px", borderRadius: 8,
          fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,.3)"
        }}>
          {toast}
        </div>
      )}

      {/* ── Vehicle Fleet ── */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <h2>Vehicle Fleet</h2>
          <span className="hint">
            {loading ? "loading..." : `${availableCount} / ${trucks.length} available`}
          </span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="branch-table">
            <thead>
              <tr>
                <th style={{ width: 50, textAlign: "center" }}>Available</th>
                <th>Vehicle</th>
                <th>Plate</th>
                <th className="num" style={{ textAlign: "center" }}>Capacity (M฿)</th>
                <th>Center</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j}><Skeleton width={60} height={12} /></td>
                    ))}
                  </tr>
                ))
                : trucks.map((t) => (
                  <tr key={t.truckId} style={{ opacity: t.isAvailable ? 1 : 0.5 }}>
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => toggleTruck(t.truckId)}
                        style={{
                          width: 38, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                          background: t.isAvailable ? COLOR.green : "#475569",
                          position: "relative", transition: "background 0.2s",
                        }}
                      >
                        <span style={{
                          position: "absolute", top: 2, width: 18, height: 18, borderRadius: 9,
                          background: "#fff", transition: "left 0.2s",
                          left: t.isAvailable ? 18 : 2,
                        }} />
                      </button>
                    </td>
                    <td style={{ fontWeight: 600 }}>{t.truckId}</td>
                    <td style={{ color: "var(--muted)" }}>{t.plateNumber || "—"}</td>
                    <td className="num" style={{ textAlign: "center" }}>{t.cashCapacity ?? "—"}</td>
                    <td style={{ color: "var(--muted)", fontSize: 11 }}>{t.centerId || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Route Parameters ── */}
      <div className="panel">
        <div className="panel-head">
          <h2>Route Parameters</h2>
          <span className="hint">{params.length} parameters across {Object.keys(grouped).length} categories</span>
        </div>
        <div className="panel-body" style={{ padding: 16 }}>
          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)" }}>
                  <Skeleton width={120} height={14} style={{ marginBottom: 12 }} />
                  {Array.from({ length: 3 }).map((_, j) => (
                    <Skeleton key={j} width="100%" height={12} style={{ marginBottom: 8 }} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
              {Object.entries(grouped).map(([type, items]) => {
                const meta = CATEGORY_META[type] ?? { label: type, icon: Settings, color: COLOR.slate };
                const Icon = meta.icon;
                return (
                  <div key={type} style={{
                    padding: 16, borderRadius: 10,
                    border: `1px solid color-mix(in srgb, ${meta.color} 25%, var(--border))`,
                    background: "transparent",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <Icon size={16} color={meta.color} />
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{meta.label}</span>
                      <span style={{ color: "var(--muted)", fontSize: 10, marginLeft: "auto" }}>
                        {items.length} params
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {items.map((p) => (
                        <div key={p.parameter} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                              title={p.description}>
                              {p.description}
                            </div>
                            <div style={{ fontSize: 9, color: "var(--muted)" }}>{p.parameter}</div>
                          </div>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={drafts[p.parameter] ?? String(p.value)}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setDrafts((d) => ({ ...d, [p.parameter]: raw }));
                              const n = parseFloat(raw);
                              if (Number.isFinite(n)) editParam(p.parameter, n);
                            }}
                            onBlur={() => setDrafts((d) => {
                              const next = { ...d };
                              delete next[p.parameter];
                              return next;
                            })}
                            style={{
                              width: 90, padding: "4px 8px", borderRadius: 6,
                              border: `1px solid ${p.parameter in paramChanges ? COLOR.amber : "var(--border)"}`,
                              background: "var(--inset)", color: "var(--text)",
                              fontSize: 12, textAlign: "right", fontWeight: 600,
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Future: Re-optimize button */}
      <div style={{ marginTop: 16, padding: 16, borderRadius: 10, border: "1px dashed var(--border)", textAlign: "center", color: "var(--muted)" }}>
        <span style={{ fontSize: 12 }}>
          🚧 Future: "Re-optimize" button will trigger the optimization model with the current configuration
        </span>
      </div>
    </div>
  );
}
