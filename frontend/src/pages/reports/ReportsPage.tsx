import { useMemo, useState } from "react";
import { FileText, Download, Calendar, CheckCircle2, Truck, MapPin, Ruler, Banknote } from "lucide-react";
import {
  REPORT_REGISTRY,
  generateReport,
  reportPreview,
  type ReportId,
  type PlanTypeLabel,
} from "@/domain/reportsData";
import { useAppData } from "@/hooks/useAppData";
import { thb } from "@/utils/format";
import Skeleton from "@/components/Skeleton";
import ReportIllustration from "./_ReportIllustration";

export default function ReportsPage() {
  const { execs, dataLoading } = useAppData();
  const [planType] = useState<PlanTypeLabel>("PLAN");
  const [date, setDate] = useState("2025-05-08");
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  const preview = useMemo(() => reportPreview(execs), [execs]);
  const report = REPORT_REGISTRY[0]; // Route Report (only one for now)

  const run = (reportId: ReportId) => {
    setGenerating(reportId);
    const result = generateReport(execs, { reportId, planType, date });
    setToast(result);
    setGenerating(null);
    setTimeout(() => setToast(null), 5000);
  };

  return (
    <div className="reports-page">
      {toast && (
        <div className="reports-toast" style={{ background: toast.ok ? undefined : "rgba(239,68,68,0.15)", borderColor: toast.ok ? undefined : "#ef4444" }}>
          <CheckCircle2 size={16} />
          {toast.message}
        </div>
      )}

      {/* ── Report selector (currently 1 report, universal for future) ── */}
      <section className="reports-section">
        <h2 className="reports-section-title">Available Reports</h2>
        <div className="reports-predefined-grid">
          {dataLoading ? (
            <div className="reports-card">
              <Skeleton width={22} height={22} radius={6} />
              <Skeleton width="70%" height={14} style={{ marginTop: 10 }} />
              <Skeleton width="90%" height={12} style={{ marginTop: 6 }} />
            </div>
          ) : (
            <div className="reports-card" style={{ borderColor: "var(--accent, #38bdf8)", borderWidth: 2 }}>
              <FileText size={22} className="reports-card-icon" />
              <h3>{report.title}</h3>
              <p>{report.description}</p>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                {report.outputs.length} download{report.outputs.length > 1 ? "s" : ""} available
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Options & Download ── */}
      <section className="reports-section panel reports-custom">
        <h2 className="reports-section-title">{report.title}</h2>
        <div className="reports-custom-body">
          <div className="reports-custom-fields">
            {/* Plan Type */}
            <div className="reports-field">
              <label>Plan Type</label>
              <div className="reports-format-row">
                <button
                  type="button"
                  className={`reports-format-btn fmt-excel ${planType === "PLAN" ? "active" : ""}`}
                >
                  PLAN
                </button>
                <button
                  type="button"
                  className="reports-format-btn fmt-pdf"
                  disabled
                  title="Actual data not available yet"
                  style={{ opacity: 0.4, cursor: "not-allowed" }}
                >
                  ACTUAL
                </button>
              </div>
            </div>

            {/* Date */}
            <div className="reports-field">
              <label>Date</label>
              <div className="reports-date-range">
                <Calendar size={15} className="reports-cal-icon" />
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="reports-date" />
              </div>
              <span className="reports-date-hint">
                {dataLoading
                  ? <Skeleton width={100} height={11} style={{ display: "inline-block" }} />
                  : `Available: 2025-05-08`}
              </span>
            </div>

            {/* Preview stats */}
            {!dataLoading && execs.length > 0 && (
              <div className="reports-field">
                <label>Preview</label>
                <div style={{
                  display: "flex", gap: 16, flexWrap: "wrap",
                  padding: "10px 14px", borderRadius: 8,
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Truck size={13} /> {preview.trucks} trucks
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <MapPin size={13} /> {preview.stops} stops
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Ruler size={13} /> {preview.km.toLocaleString()} km
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Banknote size={13} /> {thb(preview.cost)}
                  </span>
                </div>
              </div>
            )}

            {/* Download buttons */}
            <div className="reports-field">
              <label>Download</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {report.outputs.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="btn primary reports-gen-btn"
                    disabled={generating === o.id || dataLoading || !execs.length}
                    onClick={() => run(o.id)}
                    style={{ justifyContent: "flex-start", gap: 8 }}
                  >
                    <Download size={14} />
                    {generating === o.id ? "Generating…" : `${o.title} (CSV)`}
                    <span style={{ fontSize: 10, opacity: 0.7, marginLeft: "auto" }}>{o.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="reports-custom-art">
            <ReportIllustration />
          </div>
        </div>
      </section>
    </div>
  );
}
