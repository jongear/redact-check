import { useMemo, useState } from "react";
import JSZip from "jszip";
import { analyzePdf } from "./pdf/analyze";
import { cleanPdf } from "./pdf/clean";
import { downloadBlob } from "./pdf/audit";
import type { PageAudit, PdfJobState, BatchAuditLog } from "./pdf/types";

// Demo test files from public folder
const DEMO_FILES = [
  {
    url: "/redact-check/assets/test-overlay-black.pdf",
    name: "test-overlay-black.pdf",
    description: "Black rectangle overlay",
    risk: "flagged" as const
  },
  {
    url: "/redact-check/assets/test-mixed-methods.pdf",
    name: "test-mixed-methods.pdf",
    description: "Mixed overlay + annotation",
    risk: "flagged" as const
  },
  {
    url: "/redact-check/assets/test-annotation-redact.pdf",
    name: "test-annotation-redact.pdf",
    description: "PDF redaction annotations",
    risk: "flagged" as const
  },
  {
    url: "/redact-check/assets/test-clean.pdf",
    name: "test-clean.pdf",
    description: "Clean document",
    risk: "none" as const
  }
].sort((a, b) => {
  // Sort by risk level first (flagged > none), then alphabetically
  const riskOrder = { flagged: 0, none: 1 };
  const riskDiff = riskOrder[a.risk] - riskOrder[b.risk];
  if (riskDiff !== 0) return riskDiff;
  // Then alphabetically by name
  return a.name.localeCompare(b.name);
});

function riskBadge(risk: PageAudit["risk"]) {
  const badges = {
    flagged: { text: "⚠️ Flagged", className: "risk-badge risk-flagged" },
    none: { text: "✅ Clean", className: "risk-badge risk-none" }
  };
  const badge = badges[risk];
  return <span className={badge.className}>{badge.text}</span>;
}

export default function App() {
  const [jobs, setJobs] = useState<Map<string, PdfJobState>>(new Map());
  const [globalStatus, setGlobalStatus] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [demoFilesExpanded, setDemoFilesExpanded] = useState<boolean>(false);

  // Computed values
  const jobsArray = useMemo(() =>
    Array.from(jobs.values()).sort((a, b) =>
      a.file.name.localeCompare(b.file.name)
    ), [jobs]
  );

  const completedJobs = useMemo(() =>
    jobsArray.filter(j => j.status === "complete"), [jobsArray]
  );

  const flaggedJobs = useMemo(() =>
    completedJobs.filter(j => j.audit && j.audit.summary.pages_flagged > 0),
    [completedJobs]
  );

  // Helper: determine if a job actually needs cleaning
  const jobNeedsCleaning = (job: PdfJobState): boolean => {
    if (!job.audit) return false;
    // Clean if any page is flagged
    return job.audit.pages.some(p => p.risk === "flagged");
  };

  const jobsNeedingCleaning = useMemo(() =>
    flaggedJobs.filter(jobNeedsCleaning),
    [flaggedJobs]
  );

  const aggregateStats = useMemo(() => {
    const stats = {
      total_files: jobs.size,
      completed: 0,
      failed: 0,
      total_pages: 0,
      total_flagged: 0
    };

    jobsArray.forEach(job => {
      if (job.status === "complete" && job.audit) {
        stats.completed++;
        stats.total_pages += job.audit.source.page_count;
        stats.total_flagged += job.audit.summary.pages_flagged;
      } else if (job.status === "error") {
        stats.failed++;
      }
    });

    return stats;
  }, [jobs, jobsArray]);

  // Load demo file
  async function loadDemoFile(demoUrl: string, fileName: string) {
    try {
      const response = await fetch(demoUrl);
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: "application/pdf" });
      await onPickFiles([file]);
    } catch (e) {
      setGlobalStatus(`Failed to load demo file: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // File selection and processing
  async function onPickFiles(files: File[]) {
    setJobs(new Map());
    setIsProcessing(true);
    setGlobalStatus(`Loading ${files.length} file(s)...`);

    // Create job entries
    const newJobs = new Map<string, PdfJobState>();
    files.forEach(file => {
      const id = crypto.randomUUID();
      newJobs.set(id, {
        id,
        file,
        bytes: null,
        audit: null,
        cleanedBytes: null,
        cleanSummary: null,
        status: "pending",
        error: null,
        expanded: false
      });
    });
    setJobs(newJobs);

    // Process in parallel with concurrency limit
    const CONCURRENCY_LIMIT = 3;
    const jobIds = Array.from(newJobs.keys());

    for (let i = 0; i < jobIds.length; i += CONCURRENCY_LIMIT) {
      const batch = jobIds.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.all(batch.map(id => processJob(id, newJobs)));
    }

    setIsProcessing(false);

    // Update summary status
    const currentJobs = Array.from(jobs.values());
    const failed = currentJobs.filter(j => j.status === "error").length;
    const succeeded = files.length - failed;
    setGlobalStatus(
      `Analysis complete. ${succeeded}/${files.length} successful` +
      (failed > 0 ? `, ${failed} failed` : "")
    );
  }

  async function processJob(jobId: string, jobsSnapshot: Map<string, PdfJobState>) {
    const job = jobsSnapshot.get(jobId);
    if (!job) return;

    setGlobalStatus(`Analyzing: ${job.file.name}`);
    setJobs(prev => {
      const next = new Map(prev);
      const currentJob = next.get(jobId);
      if (currentJob) {
        next.set(jobId, { ...currentJob, status: "analyzing" });
      }
      return next;
    });

    try {
      // Read file
      const buf = new Uint8Array(await job.file.arrayBuffer());

      // Validate PDF
      if (buf.length === 0) {
        throw new Error("File is empty");
      }
      const header = new TextDecoder().decode(buf.slice(0, 5));
      if (!header.startsWith("%PDF-")) {
        throw new Error("Not a valid PDF (missing header)");
      }

      // Analyze
      const audit = await analyzePdf(buf, job.file.name);

      // Update to complete (release bytes to save memory - will re-read from File on download)
      setJobs(prev => {
        const next = new Map(prev);
        next.set(jobId, {
          ...job,
          bytes: null, // Release memory - we still have job.file to re-read from
          audit,
          status: "complete",
          error: null
        });
        return next;
      });

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Error processing ${jobId}:`, err);

      setJobs(prev => {
        const next = new Map(prev);
        const job = next.get(jobId);
        if (job) {
          next.set(jobId, {
            ...job,
            status: "error",
            error: errorMsg
          });
        }
        return next;
      });
    }
  }

  // Download functions
  function downloadJobAudit(jobId: string) {
    const job = jobs.get(jobId);
    if (!job?.audit) return;

    const filename = job.file.name.replace(/\.pdf$/i, ".audit.json");
    downloadBlob(
      new Blob([JSON.stringify(job.audit, null, 2)], { type: "application/json" }),
      filename
    );
  }

  async function downloadJobCleaned(jobId: string) {
    const job = jobs.get(jobId);
    if (!job?.audit) return;

    // Lazy cleaning
    if (!job.cleanedBytes) {
      setGlobalStatus(`Cleaning ${job.file.name}...`);
      try {
        // Re-read bytes from File object (we released them after analysis to save memory)
        const bytes = new Uint8Array(await job.file.arrayBuffer());
        const res = await cleanPdf(bytes, job.audit);

        setJobs(prev => {
          const next = new Map(prev);
          next.set(jobId, {
            ...job,
            cleanedBytes: res.cleanedBytes,
            cleanSummary: res.actionsSummary
          });
          return next;
        });

        const filename = job.file.name.replace(/\.pdf$/i, ".cleaned.pdf");
        downloadBlob(new Blob([res.cleanedBytes.slice()], { type: "application/pdf" }), filename);
        setGlobalStatus("");
      } catch (err) {
        setGlobalStatus(`Error cleaning ${job.file.name}: ${err}`);
      }
    } else {
      const filename = job.file.name.replace(/\.pdf$/i, ".cleaned.pdf");
      downloadBlob(new Blob([job.cleanedBytes.slice()], { type: "application/pdf" }), filename);
    }
  }

  function downloadAllAudits() {
    if (completedJobs.length === 0) return;

    const batchAudit: BatchAuditLog = {
      schema: "com.example.redact-check.batch",
      schema_version: "1.0.0",
      tool: { name: "redact-check", version: "0.1.0", build: "web" },
      generated_at: new Date().toISOString(),
      batch_summary: aggregateStats,
      files: completedJobs.map(job => ({
        file_name: job.file.name,
        audit: job.audit
      }))
    };

    downloadBlob(
      new Blob([JSON.stringify(batchAudit, null, 2)], { type: "application/json" }),
      `batch-audit-${new Date().toISOString().split('T')[0]}.json`
    );
  }

  async function downloadAllCleanedAsZip() {
    if (jobsNeedingCleaning.length === 0) return;

    setGlobalStatus("Preparing ZIP archive...");
    const zip = new JSZip();

    for (const job of jobsNeedingCleaning) {
      if (!job.audit) continue;

      let cleanedBytes: Uint8Array;

      if (job.cleanedBytes) {
        cleanedBytes = job.cleanedBytes;
      } else {
        try {
          setGlobalStatus(`Cleaning ${job.file.name}...`);
          // Re-read bytes from File object (we released them after analysis to save memory)
          const bytes = new Uint8Array(await job.file.arrayBuffer());
          const res = await cleanPdf(bytes, job.audit);

          setJobs(prev => {
            const next = new Map(prev);
            next.set(job.id, {
              ...job,
              cleanedBytes: res.cleanedBytes,
              cleanSummary: res.actionsSummary
            });
            return next;
          });

          cleanedBytes = res.cleanedBytes;
        } catch (err) {
          console.error(`Failed to clean ${job.file.name}:`, err);
          continue;
        }
      }

      const filename = job.file.name.replace(/\.pdf$/i, ".cleaned.pdf");
      zip.file(filename, cleanedBytes);
    }

    setGlobalStatus("Generating ZIP file...");
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    downloadBlob(
      zipBlob,
      `cleaned-pdfs-${new Date().toISOString().split('T')[0]}.zip`
    );

    setGlobalStatus("ZIP download complete.");
  }

  function toggleJobExpanded(jobId: string) {
    setJobs(prev => {
      const next = new Map(prev);
      const job = next.get(jobId);
      if (job) {
        next.set(jobId, { ...job, expanded: !job.expanded });
      }
      return next;
    });
  }

  return (
    <div className="container">
      <h1>Redact Check</h1>
      <p className="subtitle">
        Client-side tool to <b>detect likely bad redactions</b> and export <b>cleaned PDFs</b> (heuristic).
        Your PDFs stay in your browser.
      </p>

      <div className="card card-upload">
        <div className="upload-controls">
          {/* Hidden file inputs */}
          <input
            id="file-input"
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) void onPickFiles(files);
              setDropdownOpen(false);
            }}
            style={{ display: 'none' }}
          />
          <input
            id="folder-input"
            type="file"
            accept="application/pdf"
            // @ts-ignore - webkitdirectory is not in standard types
            webkitdirectory="true"
            directory="true"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files || [])
                .filter(f => f.name.toLowerCase().endsWith('.pdf'));
              if (files.length > 0) void onPickFiles(files);
              setDropdownOpen(false);
            }}
            style={{ display: 'none' }}
          />

          {/* Dropdown button */}
          <div className="dropdown">
            <button
              className="dropdown-button primary"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
            >
              Choose PDFs ▼
            </button>
            {dropdownOpen && (
              <div className="dropdown-menu">
                <button
                  className="dropdown-item"
                  onClick={() => {
                    document.getElementById('file-input')?.click();
                  }}
                >
                  📄 Select Files
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    document.getElementById('folder-input')?.click();
                  }}
                >
                  📁 Select Folder
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="demo-files-toggle">
          <button
            className="demo-files-toggle-button"
            onClick={() => setDemoFilesExpanded(!demoFilesExpanded)}
            disabled={isProcessing}
          >
            <span>Try demo files</span>
            <span className={`expand-icon ${demoFilesExpanded ? 'expanded' : ''}`}>▼</span>
          </button>
        </div>

        {demoFilesExpanded && (
          <div className="demo-files">
            {DEMO_FILES.map(demo => (
              <div key={demo.name} className="demo-file-item">
                <button
                  className="demo-file-button"
                  onClick={() => loadDemoFile(demo.url, demo.name)}
                  disabled={isProcessing}
                  title={`${demo.description} - Click to analyze`}
                >
                  <div className="demo-file-name">{demo.name}</div>
                  <div className="demo-file-desc">{demo.description}</div>
                  <div className="demo-file-badge">{riskBadge(demo.risk)}</div>
                </button>
                <a
                  href={demo.url}
                  download={demo.name}
                  className="demo-file-download"
                  title="Download original PDF"
                >
                  ⬇️
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

        {globalStatus && (
          <div className="row" style={{ marginTop: 16 }}>
            <span className="badge badge-status"><small>{globalStatus}</small></span>
          </div>
        )}

        {isProcessing && (
          <div className="progress-bar" style={{ marginTop: 16 }}>
            <div className="progress-fill" style={{
              width: `${jobs.size > 0 ? (completedJobs.length / jobs.size) * 100 : 0}%`
            }} />
            <span className="progress-text">
              {completedJobs.length} / {jobs.size} complete
            </span>
          </div>
        )}

      {jobs.size > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Batch Summary</h2>
          <div className="summary-grid">
            <div className="summary-card">
              <span className="summary-value">{aggregateStats.total_files}</span>
              <span className="summary-label">Files Analyzed</span>
            </div>
            <div className="summary-card">
              <span className="summary-value">{aggregateStats.total_pages}</span>
              <span className="summary-label">Total Pages</span>
            </div>
            <div className="summary-card">
              <span className="summary-value" style={{ color: "var(--danger)" }}>
                {aggregateStats.total_flagged}
              </span>
              <span className="summary-label">Flagged Pages</span>
            </div>
            <div className="summary-card">
              <span className="summary-value" style={{ color: "var(--success)" }}>
                {aggregateStats.total_pages - aggregateStats.total_flagged}
              </span>
              <span className="summary-label">Clean Pages</span>
            </div>
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button
              onClick={downloadAllAudits}
              disabled={completedJobs.length === 0}
            >
              Download All Audits (JSON)
            </button>
            <button
              className="primary"
              onClick={downloadAllCleanedAsZip}
              disabled={jobsNeedingCleaning.length === 0}
            >
              Download All Cleaned PDFs (ZIP)
            </button>
            <button onClick={() => setJobs(new Map())}>
              Clear All
            </button>
          </div>
        </div>
      )}

      {jobsArray.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Files ({jobsArray.length})</h2>
          <div className="file-list">
            {jobsArray.map(job => (
              <div key={job.id} className="file-item">
                <div
                  className="file-item-header"
                  onClick={() => toggleJobExpanded(job.id)}
                >
                  <div className="file-item-info">
                    <span className={`status-dot status-${job.status}`} />
                    <span className="file-name">{job.file.name}</span>
                    {job.audit && (
                      <div className="file-quick-stats">
                        <span className="stat-badge">
                          {job.audit.source.page_count} pages
                        </span>
                        {job.audit.summary.pages_flagged > 0 && (
                          jobNeedsCleaning(job) ? (
                            <span className="stat-badge stat-flagged">
                              {job.audit.summary.pages_flagged} flagged
                            </span>
                          ) : (
                            <span className="stat-badge stat-clean">
                              ✓ Reviewed - Clean
                            </span>
                          )
                        )}
                      </div>
                    )}
                    {job.error && (
                      <span className="error-text">{job.error}</span>
                    )}
                  </div>

                  <div className="file-item-actions">
                    {job.status === "complete" && job.audit && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadJobAudit(job.id);
                          }}
                          className="btn-icon"
                          title="Download audit.json"
                        >
                          📋
                        </button>
                        {jobNeedsCleaning(job) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadJobCleaned(job.id);
                            }}
                            className="btn-icon primary"
                            title="Download cleaned PDF"
                          >
                            ⬇️
                          </button>
                        )}
                      </>
                    )}
                    <span className={`expand-icon ${job.expanded ? 'expanded' : ''}`}>
                      ▼
                    </span>
                  </div>
                </div>

                {job.expanded && job.status === "complete" && job.audit && (
                  <div className="file-item-details">
                    <div className="summary-grid-compact">
                      <div className="summary-card-compact">
                        <span className="summary-value-compact">
                          {job.audit.source.page_count}
                        </span>
                        <span className="summary-label">Pages</span>
                      </div>
                      <div className="summary-card-compact">
                        <span className="summary-value-compact">
                          {job.audit.summary.pages_flagged}
                        </span>
                        <span className="summary-label">Flagged</span>
                      </div>
                      <div className="summary-card-compact">
                        <span className="summary-value-compact" style={{ color: "var(--success)" }}>
                          {job.audit.source.page_count - job.audit.summary.pages_flagged}
                        </span>
                        <span className="summary-label">Clean</span>
                      </div>
                    </div>

                    {(() => {
                      const flaggedPages = job.audit.pages
                        .filter(p => p.risk === "flagged")
                        .sort((a, b) => b.confidence - a.confidence);

                      return flaggedPages.length > 0 ? (
                        <div style={{ marginTop: 16 }}>
                          <h4>Flagged Pages</h4>
                          <table className="table-compact">
                            <thead>
                              <tr>
                                <th>Page</th>
                                <th>Risk</th>
                                <th>Confidence</th>
                                <th>Dark rects</th>
                                <th>Redact annots</th>
                                <th>Overlap</th>
                              </tr>
                            </thead>
                            <tbody>
                              {flaggedPages.map(p => (
                                <tr key={p.page}>
                                  <td>{p.page}</td>
                                  <td>{riskBadge(p.risk)}</td>
                                  <td>{p.confidence}</td>
                                  <td>{p.signals.dark_rects}</td>
                                  <td>{p.signals.redact_annots}</td>
                                  <td>{p.signals.overlaps_text_likely ? "yes" : "no"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p style={{ marginTop: 16, color: "var(--success)" }}>
                          No issues detected.
                        </p>
                      );
                    })()}

                    {job.cleanSummary && (
                      <div style={{ marginTop: 16 }}>
                        <h4>Cleaning Actions</h4>
                        <pre style={{ fontSize: '0.75rem', padding: '12px' }}>
                          {JSON.stringify(job.cleanSummary, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Notes</h2>
        <ul>
          <li>Analysis runs automatically when you upload PDFs.</li>
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
