import { useState } from "react";
import { RiskBadge } from "./RiskBadge";
import type { PageAudit } from "../pdf/types";

type DemoFileConfig = {
  name: string;
  description: string;
  risk: PageAudit["risk"];
};

type DemoFile = DemoFileConfig & { url: string };

const DEMO_FILE_CONFIGS: DemoFileConfig[] = [
  {
    name: "test-overlay-black.pdf",
    description: "Black rectangle overlay",
    risk: "flagged"
  },
  {
    name: "test-mixed-methods.pdf",
    description: "Mixed overlay + annotation",
    risk: "flagged"
  },
  {
    name: "test-annotation-redact.pdf",
    description: "PDF redaction annotations",
    risk: "flagged"
  },
  {
    name: "test-clean.pdf",
    description: "Clean document",
    risk: "none"
  }
] as const;

// Generate demo files with computed URLs
const DEMO_BASE_PATH = "/redact-check/assets/";
const DEMO_FILES: DemoFile[] = DEMO_FILE_CONFIGS.map(config => ({
  ...config,
  url: `${DEMO_BASE_PATH}${config.name}`
}));

const SORTED_DEMO_FILES = [...DEMO_FILES].sort((a, b) => {
  // Sort by risk level first (flagged > none), then alphabetically
  const riskOrder: Record<PageAudit["risk"], number> = { flagged: 0, none: 1 };
  const riskDiff = riskOrder[a.risk] - riskOrder[b.risk];
  if (riskDiff !== 0) return riskDiff;
  // Then alphabetically by name
  return a.name.localeCompare(b.name);
});

interface DemoFilesProps {
  onLoadDemo: (url: string, fileName: string) => Promise<void>;
  isProcessing: boolean;
}

export function DemoFiles({ onLoadDemo, isProcessing }: DemoFilesProps) {
  const [demoFilesExpanded, setDemoFilesExpanded] = useState<boolean>(false);

  return (
    <>
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
          {SORTED_DEMO_FILES.map(demo => (
            <div key={demo.name} className="demo-file-item">
              <button
                className="demo-file-button"
                onClick={() => onLoadDemo(demo.url, demo.name)}
                disabled={isProcessing}
                title={`${demo.description} - Click to analyze`}
              >
                <div className="demo-file-name">{demo.name}</div>
                <div className="demo-file-desc">{demo.description}</div>
                <div className="demo-file-badge"><RiskBadge risk={demo.risk} /></div>
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
    </>
  );
}
