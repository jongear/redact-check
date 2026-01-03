import { useMemo, useState } from "react";
import { analyzePdf } from "./pdf/analyze";
import type { PdfJobState } from "./pdf/types";
import { FileItem } from "./components/FileItem";
import { DemoFiles } from "./components/DemoFiles";
import { BatchSummary } from "./components/BatchSummary";
import { useDownloads } from "./hooks/useDownloads";
export default function App() {
  const [jobs, setJobs] = useState<Map<string, PdfJobState>>(new Map());
  const [globalStatus, setGlobalStatus] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [fileFilter, setFileFilter] = useState<string>("");

  // Computed values
  const jobsArray = useMemo(() =>
    Array.from(jobs.values()).sort((a, b) =>
      a.file.name.localeCompare(b.file.name)
    ), [jobs]
  );

  const filteredJobs = useMemo(() => {
    if (!fileFilter.trim()) return jobsArray;
    const query = fileFilter.toLowerCase();
    return jobsArray.filter(job => job.file.name.toLowerCase().includes(query));
  }, [jobsArray, fileFilter]);

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

  // Download hooks
  const {
    downloadJobAudit,
    downloadJobCleaned,
    downloadAllAudits,
    downloadAllCleanedAsZip
  } = useDownloads({
    jobs,
    setJobs,
    setGlobalStatus,
    completedJobs,
    jobsNeedingCleaning,
    aggregateStats
  });

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
        Identify PDFs where sensitive content was <b>visually hidden but not actually removed</b>.
        Automatically clean flagged files. <b>Your files never leave your browser.</b>
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

        <DemoFiles onLoadDemo={loadDemoFile} isProcessing={isProcessing} />
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
        <BatchSummary
          stats={aggregateStats}
          completedJobsCount={completedJobs.length}
          jobsNeedingCleaningCount={jobsNeedingCleaning.length}
          onDownloadAllAudits={downloadAllAudits}
          onDownloadAllCleanedAsZip={downloadAllCleanedAsZip}
          onClearAll={() => setJobs(new Map())}
        />
      )}

      {jobsArray.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Files ({filteredJobs.length}{fileFilter && ` of ${jobsArray.length}`})</h2>
            {jobsArray.length > 1 && (
              <input
                type="text"
                placeholder="Filter files..."
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                className="file-filter-input"
              />
            )}
          </div>
          <div className="file-list">
            {filteredJobs.map(job => (
              <FileItem
                key={job.id}
                job={job}
                onToggleExpanded={toggleJobExpanded}
                onDownloadAudit={downloadJobAudit}
                onDownloadCleaned={downloadJobCleaned}
                jobNeedsCleaning={jobNeedsCleaning}
              />
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
