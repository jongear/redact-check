interface BatchSummaryProps {
  stats: {
    total_files: number;
    completed: number;
    failed: number;
    total_pages: number;
    total_flagged: number;
  };
  completedJobsCount: number;
  jobsNeedingCleaningCount: number;
  onDownloadAllAudits: () => void;
  onDownloadAllCleanedAsZip: () => void;
  onClearAll: () => void;
}

export function BatchSummary({
  stats,
  completedJobsCount,
  jobsNeedingCleaningCount,
  onDownloadAllAudits,
  onDownloadAllCleanedAsZip,
  onClearAll
}: BatchSummaryProps) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2>Batch Summary</h2>
      <div className="summary-grid">
        <div className="summary-card">
          <span className="summary-value">{stats.total_files}</span>
          <span className="summary-label">Files Analyzed</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{stats.total_pages}</span>
          <span className="summary-label">Total Pages</span>
        </div>
        <div className="summary-card">
          <span className="summary-value" style={{ color: "var(--danger)" }}>
            {stats.total_flagged}
          </span>
          <span className="summary-label">Flagged Pages</span>
        </div>
        <div className="summary-card">
          <span className="summary-value" style={{ color: "var(--success)" }}>
            {stats.total_pages - stats.total_flagged}
          </span>
          <span className="summary-label">Clean Pages</span>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button
          onClick={onDownloadAllAudits}
          disabled={completedJobsCount === 0}
        >
          Download All Audits (JSON)
        </button>
        <button
          className="primary"
          onClick={onDownloadAllCleanedAsZip}
          disabled={jobsNeedingCleaningCount === 0}
        >
          Download All Cleaned PDFs (ZIP)
        </button>
        <button onClick={onClearAll}>
          Clear All
        </button>
      </div>
    </div>
  );
}
