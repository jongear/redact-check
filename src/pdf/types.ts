export type Risk = "high" | "medium" | "low" | "none";

export type PageFinding =
  | { type: "suspected_overlay_rect"; count: number; bbox_samples: Array<{ x: number; y: number; w: number; h: number }> }
  | { type: "redact_annotation"; count: number };

export type PageAudit = {
  page: number; // 1-based
  risk: Risk;
  confidence: number; // 0..100
  signals: {
    has_text: boolean;
    text_chars: number;
    dark_rects: number;
    dark_rect_area_ratio: number;
    redact_annots: number;
    overlaps_text_likely: boolean;
  };
  findings: PageFinding[];
  actions?: {
    removed_overlay_ops_estimate?: number;
    removed_redact_annots?: number;
    removed_other_annots?: number;
  };
};

export type AuditLog = {
  schema: "com.example.redact-check";
  schema_version: "1.0.0";
  tool: { name: string; version: string; build: "web" };
  source: { file_name: string; file_size_bytes: number; sha256: string; page_count: number };
  generated_at: string;
  summary: { pages_flagged: number; pages_high: number; pages_medium: number; pages_low: number };
  pages: PageAudit[];
};
