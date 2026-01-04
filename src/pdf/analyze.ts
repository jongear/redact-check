import * as pdfjs from "pdfjs-dist";
import type { AuditLog, PageAudit, Risk } from "./types";
import { sha256Hex } from "./audit";

// Worker setup (Vite-friendly)
(pdfjs as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type Rect = { x: number; y: number; w: number; h: number; area: number };

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function intersect(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const w = x2 - x1;
  const h = y2 - y1;
  return w > 0 && h > 0;
}

function isNearBlackRGB(r: number, g: number, b: number) {
  return r <= 0.15 && g <= 0.15 && b <= 0.15;
}
function isNearBlackGray(g: number) {
  return g <= 0.15;
}

// VERY heuristic: tries to infer dark filled rectangles from operator list patterns.
async function detectDarkRects(page: pdfjs.PDFPageProxy, viewport: pdfjs.PageViewport): Promise<Rect[]> {
  const opList = await page.getOperatorList();
  const fnArray: number[] = opList.fnArray;
  const argsArray: unknown[] = opList.argsArray;

  // pdf.js internal ops; numbers differ across versions, so we avoid hard-coding
  // by checking for known argument shapes and tracking color state via common setters.
  let fillRGB: [number, number, number] | null = null;
  let fillGray: number | null = null;

  // Track transformation matrix for positioning rectangles
  // Matrix format: [a, b, c, d, e, f] where e,f are translation (x,y)
  let currentTransform: { x: number; y: number } = { x: 0, y: 0 };

  const rects: Rect[] = [];

  // We'll catch patterns where constructPath includes a rectangle.
  // args often looks like: [ops, coords] where ops includes "re" equivalents.
  // Because this is version-sensitive, we detect by structure noticing 4-number sequences.
  for (let i = 0; i < fnArray.length; i++) {
    const args = argsArray[i];

    // Track transformation matrices (used by pdf-lib to position rectangles)
    // Transform operations have 6 numbers: [a, b, c, d, e, f]
    // For simple translations: [1, 0, 0, 1, x, y] where x,y is the translation
    // Identity matrix [1, 0, 0, 1, 0, 0] means no transformation
    if (Array.isArray(args) && args.length === 6 && args.every((x) => typeof x === "number")) {
      // Only update transform if it's a meaningful translation (not identity matrix)
      // Identity matrix has form [1, 0, 0, 1, 0, 0]
      const isIdentity = args[0] === 1 && args[1] === 0 && args[2] === 0 &&
                         args[3] === 1 && args[4] === 0 && args[5] === 0;

      if (!isIdentity) {
        // For simple translation matrices [1, 0, 0, 1, x, y], extract translation
        if (args[0] === 1 && args[1] === 0 && args[2] === 0 && args[3] === 1) {
          currentTransform = { x: args[4], y: args[5] };
        }
      }
    }

    // Common color setters in pdf.js operator list:
    // setFillRGBColor: args = [r,g,b]
    // setFillGray: args = [g]
    // setFillColorN: args = ["#RRGGBB"] (hex string)
    if (Array.isArray(args) && args.length === 3 && args.every((x) => typeof x === "number")) {
      // could be fill rgb
      fillRGB = [args[0], args[1], args[2]];
      fillGray = null;
    } else if (Array.isArray(args) && args.length === 1 && typeof args[0] === "number") {
      // could be fill gray
      fillGray = args[0];
      fillRGB = null;
    } else if (Array.isArray(args) && args.length === 1 && typeof args[0] === "string" && args[0].startsWith("#")) {
      // hex color string like "#000000"
      const hex = args[0];
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      fillRGB = [r, g, b];
      fillGray = null;
    }

    // constructPath: args often has a second array containing coordinates
    // We heuristically look for arrays containing many numbers in groups of 4 that
    // are plausible rects. This can over-detect; we filter by darkness + size.
    // Pattern 1: args[1] contains coordinates (older pattern)
    // Pattern 2: args[2] contains Float32Array(4) with coordinates (newer pattern)
    let coordsArray = null;
    if (Array.isArray(args) && args.length >= 2 && Array.isArray(args[1]) && args[1].length >= 4) {
      coordsArray = args[1];
    } else if (Array.isArray(args) && args.length >= 3 && (args[2] instanceof Float32Array || Array.isArray(args[2])) && args[2].length >= 4) {
      coordsArray = args[2];
    }

    if (coordsArray) {
      const nums = Array.from(coordsArray).filter((x: unknown): x is number => typeof x === "number");

      // The coords can be in different formats:
      // Format 1: [x, y, w, h] - position and dimensions (relative to transform)
      // Format 2: [x1, y1, x2, y2] - two corner points
      // We detect Format 2 if the "width" and "height" values are larger than x/y (suggesting they're coordinates)
      for (let k = 0; k + 3 < nums.length; k += 4) {
        let x = nums[k], y = nums[k + 1], w = nums[k + 2], h = nums[k + 3];
        if (![x, y, w, h].every((n) => Number.isFinite(n))) continue;

        // Check format BEFORE applying transform (since coords are in local space)
        // Check if this looks like [x1, y1, x2, y2] format
        if (w > x && h > y && w < 10000 && h < 10000) {
          // Likely [x1, y1, x2, y2] - convert to [x, y, w, h]
          const x2 = w, y2 = h;
          w = x2 - x;
          h = y2 - y;
        }

        // Now apply transformation to the position
        x += currentTransform.x;
        y += currentTransform.y;

        const aw = Math.abs(w), ah = Math.abs(h);
        if (aw < 5 || ah < 5) continue;

        const dark =
          (fillRGB && isNearBlackRGB(fillRGB[0], fillRGB[1], fillRGB[2])) ||
          (fillGray !== null && isNearBlackGray(fillGray));

        if (!dark) continue;

        // Transform rectangle from PDF space to viewport space
        // viewport.convertToViewportRectangle expects [x1, y1, x2, y2] in PDF space
        const x2 = x + aw;
        const y2 = y + ah;
        const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle([x, y, x2, y2]);
        const vx = Math.min(vx1, vx2);
        const vy = Math.min(vy1, vy2);
        const vw = Math.abs(vx2 - vx1);
        const vh = Math.abs(vy2 - vy1);
        const varea = vw * vh;

        // Apply filters in viewport space (after transformation)
        const pageArea = viewport.width * viewport.height;
        const areaRatio = varea / pageArea;

        if (areaRatio > 0.6) continue; // likely background

        // min area: either a ratio threshold or absolute px-ish threshold
        if (varea < Math.max(pageArea * 0.0005, 2000)) continue;

        rects.push({ x: vx, y: vy, w: vw, h: vh, area: varea });
      }
    }
  }

  // de-dupe-ish: keep top unique-ish by rounding
  const seen = new Set<string>();
  const out: Rect[] = [];
  for (const r of rects) {
    const key = `${Math.round(r.x)}:${Math.round(r.y)}:${Math.round(r.w)}:${Math.round(r.h)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }

  return out;
}

async function getTextBBoxes(page: pdfjs.PDFPageProxy, viewport: pdfjs.PageViewport) {
  const tc = await page.getTextContent();
  const items = tc.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>;
  const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  let textChars = 0;

  for (const it of items) {
    const str = (it.str ?? "") as string;
    const trimmed = str.replace(/\s+/g, "");
    textChars += trimmed.length;

    // Approx bbox:
    // transform is [a,b,c,d,e,f] in PDF space; viewport.convertToViewportPoint handles points.
    // width/height are provided in some builds; otherwise we approximate.
    const tx = it.transform?.[4] ?? 0;
    const ty = it.transform?.[5] ?? 0;

    const [vx, vy] = viewport.convertToViewportPoint(tx, ty);
    const w = Math.abs(it.width ?? (str.length * 5));
    const h = Math.abs(it.height ?? 10);

    boxes.push({ x: vx, y: vy - h, w, h });
  }

  return { boxes, textChars };
}

function scoreAndRisk(params: {
  hasText: boolean;
  textChars: number;
  darkRects: Rect[];
  overlapsTextLikely: boolean;
  redactAnnots: number;
  viewport: pdfjs.PageViewport;
}): { confidence: number; risk: Risk; darkRectAreaRatio: number } {
  const pageArea = params.viewport.width * params.viewport.height;
  const darkRectAreaRatio = params.darkRects.reduce((s, r) => s + r.area, 0) / pageArea;

  let score = 0;
  if (params.overlapsTextLikely) score += 40;
  if (params.redactAnnots > 0) score += 50;
  if (darkRectAreaRatio >= 0.005 && darkRectAreaRatio <= 0.2) score += 15;
  if (params.darkRects.some((r) => (r.w / r.h >= 3 || r.h / r.w >= 3))) score += 10;
  if (!params.hasText) score -= 20;
  if (params.darkRects.some((r) => r.area / pageArea > 0.6)) score -= 30;

  score = clamp(score, 0, 100);

  // Binary risk: flagged if confidence >= 20, otherwise clean
  const risk: Risk = score >= 20 ? "flagged" : "none";

  return { confidence: score, risk, darkRectAreaRatio };
}

export async function analyzePdf(bytes: Uint8Array, fileName: string): Promise<AuditLog> {
  const sha = await sha256Hex(bytes);
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  const pages: PageAudit[] = [];
  const pageCount = pdf.numPages;

  for (let p = 1; p <= pageCount; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.5 });

    const { boxes: textBoxes, textChars } = await getTextBBoxes(page, viewport);
    const hasText = textChars >= 20;

    // Annotations
    const annots = await page.getAnnotations();
    const redactAnnots = annots.filter((a: { subtype?: string }) => String(a.subtype).toLowerCase() === "redact").length;

    const darkRects = await detectDarkRects(page, viewport);

    // overlap test
    let overlapsTextLikely = false;
    if (darkRects.length > 0 && textBoxes.length > 0) {
      outer: for (const r of darkRects) {
        for (const t of textBoxes) {
          if (intersect({ x: r.x, y: r.y, w: r.w, h: r.h }, t)) {
            overlapsTextLikely = true;
            break outer;
          }
        }
      }
    }

    const { confidence, risk, darkRectAreaRatio } = scoreAndRisk({
      hasText, textChars, darkRects, overlapsTextLikely, redactAnnots, viewport,
    });

    const findings: PageAudit["findings"] = [];
    if (darkRects.length > 0) {
      findings.push({
        type: "suspected_overlay_rect",
        count: darkRects.length,
        bbox_samples: darkRects.slice(0, 3).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
      });
    }
    if (redactAnnots > 0) findings.push({ type: "redact_annotation", count: redactAnnots });

    pages.push({
      page: p,
      risk,
      confidence,
      signals: {
        has_text: hasText,
        text_chars: textChars,
        dark_rects: darkRects.length,
        dark_rect_area_ratio: Number(darkRectAreaRatio.toFixed(4)),
        redact_annots: redactAnnots,
        overlaps_text_likely: overlapsTextLikely,
      },
      findings,
    });

    page.cleanup();
  }

  const pages_flagged = pages.filter((x) => x.risk === "flagged").length;

  pdf.destroy();

  return {
    schema: "com.example.redact-check",
    schema_version: "1.0.0",
    tool: { name: "redact-check", version: "0.1.0", build: "web" },
    source: {
      file_name: fileName,
      file_size_bytes: bytes.byteLength,
      sha256: sha,
      page_count: pageCount,
    },
    generated_at: new Date().toISOString(),
    summary: { pages_flagged },
    pages,
  };
}
