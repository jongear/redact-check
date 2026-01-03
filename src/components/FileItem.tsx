import type { PdfJobState } from "../pdf/types";
import { RiskBadge } from "./RiskBadge";

interface FileItemProps {
  job: PdfJobState;
  onToggleExpanded: (id: string) => void;
  onDownloadAudit: (id: string) => void;
  onDownloadCleaned: (id: string) => void;
  jobNeedsCleaning: (job: PdfJobState) => boolean;
}

export function FileItem({
  job,
  onToggleExpanded,
  onDownloadAudit,
  onDownloadCleaned,
  jobNeedsCleaning
}: FileItemProps) {
  return (
    <div className="file-item">
      <div
        className="file-item-header"
        onClick={() => onToggleExpanded(job.id)}
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
                  onDownloadAudit(job.id);
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
                    onDownloadCleaned(job.id);
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
                        <td><RiskBadge risk={p.risk} /></td>
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
  );
}
