import React, { useMemo, useState } from "react";
import { analyzePdf } from "./pdf/analyze";
import { cleanPdf } from "./pdf/clean";
import { downloadBlob } from "./pdf/audit";
import type { AuditLog, PageAudit } from "./pdf/types";

function riskBadge(risk: PageAudit["risk"]) {
  const badges = {
    high: { text: "🔥 High", className: "risk-badge risk-high" },
    medium: { text: "⚠️ Medium", className: "risk-badge risk-medium" },
    low: { text: "ℹ️ Low", className: "risk-badge risk-low" },
    none: { text: "✅ None", className: "risk-badge risk-none" }
  };
  const badge = badges[risk];
  return <span className={badge.className}>{badge.text}</span>;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);

  const [audit, setAudit] = useState<AuditLog | null>(null);
  const [status, setStatus] = useState<string>("");

  const [cleanedBytes, setCleanedBytes] = useState<Uint8Array | null>(null);
  const [cleanSummary, setCleanSummary] = useState<any>(null);

  const flaggedPages = useMemo(() => {
    if (!audit) return [];
    return [...audit.pages].filter(p => p.risk !== "none").sort((a,b) => b.confidence - a.confidence);
  }, [audit]);

  async function onPick(f: File) {
    setFile(f);
    setAudit(null);
    setCleanedBytes(null);
    setCleanSummary(null);
    setStatus("Reading file…");
    const buf = new Uint8Array(await f.arrayBuffer());
    setBytes(buf);
    setStatus("Ready.");
  }

  async function runAnalyze() {
    if (!bytes || !file) return;
    setStatus("Analyzing (PDF.js)…");
    const a = await analyzePdf(bytes, file.name);
    setAudit(a);
    setStatus(`Analyzed ${a.source.page_count} pages. Flagged ${a.summary.pages_flagged}.`);
  }

  async function runClean() {
    if (!bytes || !file) return;
    setStatus("Cleaning (pdf-lib)…");
    const res = await cleanPdf(bytes, audit ?? undefined);
    setCleanedBytes(res.cleanedBytes);
    setCleanSummary(res.actionsSummary);
    setStatus("Cleaned PDF ready. (Please verify flagged pages.)");
  }

  function downloadAudit() {
    if (!audit) return;
    downloadBlob(new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" }), "audit.json");
  }

  function downloadCleaned() {
    if (!cleanedBytes || !file) return;
    const outName = file.name.replace(/\.pdf$/i, "") + ".cleaned.pdf";
    
    downloadBlob(new Blob([cleanedBytes.slice()], { type: "application/pdf" }), outName);
  }

  return (
    <div className="container">
      <h1>Redact Check</h1>
      <p className="subtitle">
        Client-side tool to <b>detect likely bad redactions</b> and export a <b>cleaned PDF</b> (heuristic).
        Your PDF stays in your browser.
      </p>

      <div className="card card-upload">
        <div className="row">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
            }}
          />
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="primary" onClick={runAnalyze} disabled={!bytes}>Analyze</button>
          <button className="primary" onClick={runClean} disabled={!bytes}>Export Cleaned PDF</button>
          <button onClick={downloadAudit} disabled={!audit}>Download audit.json</button>
          <button onClick={downloadCleaned} disabled={!cleanedBytes}>Download cleaned PDF</button>
          {status && <span className="badge badge-status"><small>{status}</small></span>}
        </div>
      </div>

      {audit && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Summary</h2>
          <div className="summary-grid">
            <div className="summary-card">
              <span className="summary-value">{audit.source.page_count}</span>
              <span className="summary-label">Pages</span>
            </div>
            <div className="summary-card">
              <span className="summary-value">{audit.summary.pages_flagged}</span>
              <span className="summary-label">Flagged</span>
            </div>
            <div className="summary-card">
              <span className="summary-value" style={{ color: "var(--danger)" }}>{audit.summary.pages_high}</span>
              <span className="summary-label">High Risk</span>
            </div>
            <div className="summary-card">
              <span className="summary-value" style={{ color: "var(--warning)" }}>{audit.summary.pages_medium}</span>
              <span className="summary-label">Medium Risk</span>
            </div>
            <div className="summary-card">
              <span className="summary-value" style={{ color: "var(--info)" }}>{audit.summary.pages_low}</span>
              <span className="summary-label">Low Risk</span>
            </div>
          </div>

          <h3>Pages to check</h3>
          {flaggedPages.length === 0 ? (
            <p>None flagged.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Risk</th>
                  <th>Confidence</th>
                  <th>Dark rects</th>
                  <th>Redact annots</th>
                  <th>Text chars</th>
                  <th>Overlap</th>
                </tr>
              </thead>
              <tbody>
                {flaggedPages.map((p) => (
                  <tr key={p.page}>
                    <td>{p.page}</td>
                    <td>{riskBadge(p.risk)}</td>
                    <td>{p.confidence}</td>
                    <td>{p.signals.dark_rects}</td>
                    <td>{p.signals.redact_annots}</td>
                    <td>{p.signals.text_chars}</td>
                    <td>{p.signals.overlaps_text_likely ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {cleanSummary && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Clean actions (heuristic)</h2>
          <pre>{JSON.stringify(cleanSummary, null, 2)}</pre>
          <p>
            <small>
              Tip: use the audit's "Pages to check" list to quickly validate the output on long PDFs.
            </small>
          </p>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Notes</h2>
        <ul>
          <li>This won't recover properly-redacted PDFs where content was actually removed.</li>
          <li>Overlay stripping is heuristic; some PDFs use complex drawing/XObjects.</li>
          <li>For best results, run Analyze → Clean → verify the flagged pages.</li>
        </ul>
      </div>
    </div>
  );
}
