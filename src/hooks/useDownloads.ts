import JSZip from "jszip";
import { cleanPdf } from "../pdf/clean";
import { downloadBlob } from "../pdf/audit";
import type { PdfJobState, BatchAuditLog } from "../pdf/types";

interface UseDownloadsParams {
  jobs: Map<string, PdfJobState>;
  setJobs: React.Dispatch<React.SetStateAction<Map<string, PdfJobState>>>;
  setGlobalStatus: (status: string) => void;
  completedJobs: PdfJobState[];
  jobsNeedingCleaning: PdfJobState[];
  aggregateStats: {
    total_files: number;
    completed: number;
    failed: number;
    total_pages: number;
    total_flagged: number;
  };
}

export function useDownloads({
  jobs,
  setJobs,
  setGlobalStatus,
  completedJobs,
  jobsNeedingCleaning,
  aggregateStats
}: UseDownloadsParams) {

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

  return {
    downloadJobAudit,
    downloadJobCleaned,
    downloadAllAudits,
    downloadAllCleanedAsZip
  };
}
