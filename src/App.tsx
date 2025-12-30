import React, { useMemo, useState } from "react";
import { analyzePdf } from "./pdf/analyze";
import { cleanPdf } from "./pdf/clean";
import { downloadBlob } from "./pdf/audit";
import type { AuditLog, PageAudit } from "./pdf/types";

function riskBadge(risk: PageAudit["risk"]) {
  if (risk === "high") return "🔥 High";
  if (risk === "medium") return "⚠️ Medium";
  if (risk === "low") return "ℹ️ Low";
  return "✅ None";
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
      <h1 style={{ marginTop: 0 }}>Redact Check</h1>
      <p>
        Client-side tool to <b>detect likely bad redactions</b> and export a <b>cleaned PDF</b> (heuristic).
        Your PDF stays in your browser.
      </p>

      <div className="card">
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

        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={runAnalyze} disabled={!bytes}>Analyze</button>
          <button onClick={runClean} disabled={!bytes}>Export Cleaned PDF</button>
          <button onClick={downloadAudit} disabled={!audit}>Download audit.json</button>
          <button onClick={downloadCleaned} disabled={!cleanedBytes}>Download cleaned PDF</button>
          <span className="badge"><small>{status || "—"}</small></span>
        </div>
      </div>

      {audit && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Summary</h2>
          <div className="row">
            <span className="badge">Pages: {audit.source.page_count}</span>
            <span className="badge">Flagged: {audit.summary.pages_flagged}</span>
            <span className="badge">High: {audit.summary.pages_high}</span>
            <span className="badge">Medium: {audit.summary.pages_medium}</span>
            <span className="badge">Low: {audit.summary.pages_low}</span>
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
          <h2 style={{ marginTop: 0 }}>Clean actions (heuristic)</h2>
          <pre>{JSON.stringify(cleanSummary, null, 2)}</pre>
          <p>
            <small>
              Tip: use the audit’s “Pages to check” list to quickly validate the output on long PDFs.
            </small>
          </p>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Notes</h2>
        <ul>
          <li>This won’t recover properly-redacted PDFs where content was actually removed.</li>
          <li>Overlay stripping is heuristic; some PDFs use complex drawing/XObjects.</li>
          <li>For best results, run Analyze → Clean → verify the flagged pages.</li>
        </ul>
      </div>
    </div>
  );
}
