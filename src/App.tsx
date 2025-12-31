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
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      if (buf.length === 0) {
        setStatus("Error: File is empty");
        setBytes(null);
        return;
      }
      const header = new TextDecoder().decode(buf.slice(0, 5));
      if (!header.startsWith("%PDF-")) {
        setStatus("Error: File does not appear to be a valid PDF (missing header)");
        setBytes(null);
        return;
      }
      setBytes(buf);

      // Auto-analyze after file read
      setStatus("Analyzing PDF…");
      try {
        const a = await analyzePdf(buf, f.name);
        setAudit(a);

        // Contextual status message
        if (a.summary.pages_flagged === 0) {
          setStatus(`Analysis complete. No issues detected in ${a.source.page_count} pages.`);
        } else {
          setStatus(`Analysis complete. Found ${a.summary.pages_flagged} flagged page(s).`);
        }
      } catch (err) {
        console.error("Analyze error:", err);
        setStatus(`Error analyzing PDF: ${err instanceof Error ? err.message : String(err)}`);
      }
    } catch (err) {
      console.error("File read error:", err);
      setStatus(`Error reading file: ${err instanceof Error ? err.message : String(err)}`);
      setBytes(null);
    }
  }

  function downloadAudit() {
    if (!audit) return;
    downloadBlob(new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" }), "audit.json");
  }

  async function downloadCleaned() {
    if (!audit || !bytes || !file) return;

    // If not already cleaned, run cleaning now
    if (!cleanedBytes) {
      setStatus("Preparing cleaned PDF…");
      try {
        const res = await cleanPdf(bytes, audit);
        setCleanedBytes(res.cleanedBytes);
        setCleanSummary(res.actionsSummary);
        setStatus("Cleaned PDF ready.");

        // Now download it
        const outName = file.name.replace(/\.pdf$/i, "") + ".cleaned.pdf";
        downloadBlob(new Blob([res.cleanedBytes.slice()], { type: "application/pdf" }), outName);
      } catch (err) {
        console.error("Clean error:", err);
        setStatus(`Error cleaning PDF: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    } else {
      // Already cleaned, just download
      const outName = file.name.replace(/\.pdf$/i, "") + ".cleaned.pdf";
      downloadBlob(new Blob([cleanedBytes.slice()], { type: "application/pdf" }), outName);
    }
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
          <button onClick={downloadAudit} disabled={!audit}>
            Download audit.json
          </button>
          <button
            className="primary"
            onClick={downloadCleaned}
            disabled={!audit || audit.summary.pages_flagged === 0}
          >
            Download cleaned PDF
          </button>
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
          <li>Analysis runs automatically when you upload a PDF.</li>
          <li>This won't recover properly-redacted PDFs where content was actually removed.</li>
          <li>Overlay stripping is heuristic; some PDFs use complex drawing/XObjects.</li>
          <li>Always verify flagged pages in the cleaned PDF before sharing.</li>
        </ul>
      </div>

      <div className="footer">
        <div className="footer-links">
          <a
            href="https://github.com/jongear/redact-check"
            target="_blank"
            rel="noopener noreferrer"
            className="icon-link github"
          >
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Contribute on GitHub
          </a>
          <a
            href="https://buymeacoffee.com/jongear"
            target="_blank"
            rel="noopener noreferrer"
            className="icon-link coffee"
          >
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z"/>
            </svg>
            Buy Me a Coffee
          </a>
        </div>
      </div>
    </div>
  );
}
