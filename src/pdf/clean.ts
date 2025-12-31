import { PDFDocument, PDFRawStream, PDFName } from "pdf-lib";
import type { AuditLog } from "./types";

/**
 * Heuristic filter that attempts to remove common "black rectangle overlay" ops.
 * Targets patterns like:
 *   0 0 0 rg
 *   x y w h re
 *   f
 *
 * NOTE: This is not a full PDF content parser. It is intentionally conservative.
 */
function stripCommonBlackRectFills(content: string): { cleaned: string; removedEstimate: number } {
  let removed = 0;

  // Normalize line breaks for easier regex.
  const src = content.replace(/\r\n/g, "\n");

  // Pattern A: "0 0 0 rg ... re f" (RGB fill black, rectangle, fill)
  // This regex is intentionally loose but bounded to avoid nuking huge sections.
  const patternA =
    /(?:^|\n)\s*0(\.0+)?\s+0(\.0+)?\s+0(\.0+)?\s+rg\s*\n(?:[^\n]{0,200}\n){0,6}?\s*(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)\s+(\d+(\.\d+)?)\s+(\d+(\.\d+)?)\s+re\s*\n\s*(f|f\*|B|B\*)\s*(?=\n|$)/g;

  const outA = src.replace(patternA, (m) => {
    removed += 1;
    // Remove the whole block; keep a harmless no-op comment for debugging
    return "\n% stripped_suspected_black_rect_fill\n";
  });

  // Pattern B: gray fill black "0 g ... re f"
  const patternB =
    /(?:^|\n)\s*0(\.0+)?\s+g\s*\n(?:[^\n]{0,200}\n){0,6}?\s*(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)\s+(\d+(\.\d+)?)\s+(\d+(\.\d+)?)\s+re\s*\n\s*(f|f\*|B|B\*)\s*(?=\n|$)/g;

  const outB = outA.replace(patternB, (m) => {
    removed += 1;
    return "\n% stripped_suspected_black_rect_fill\n";
  });

  return { cleaned: outB, removedEstimate: removed };
}

function isProbablyContentStreamText(streamBytes: Uint8Array): boolean {
  // Heuristic: if it has many ASCII ops characters, treat as text content.
  let ascii = 0;
  for (let i = 0; i < streamBytes.length; i++) {
    const b = streamBytes[i];
    if (b === 10 || b === 13 || b === 9) { ascii++; continue; }
    if (b >= 32 && b <= 126) ascii++;
  }
  return ascii / Math.max(1, streamBytes.length) > 0.7;
}

export async function cleanPdf(bytes: Uint8Array, audit?: AuditLog): Promise<{ cleanedBytes: Uint8Array; actionsSummary: any }> {
  if (!bytes || bytes.length === 0) {
    throw new Error("No PDF data provided");
  }

  const header = new TextDecoder().decode(bytes.slice(0, 5));
  if (!header.startsWith("%PDF-")) {
    throw new Error("Invalid PDF: missing PDF header");
  }

  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  let removedRedactAnnots = 0;
  let removedOtherAnnots = 0;
  let removedOverlayOpsEstimate = 0;

  const pages = pdfDoc.getPages();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    // 1) Remove annotations array (most redact/blackout annots live here)
    // pdf-lib doesn't expose annot subtype cleanly at high level, so we remove all annots.
    // If you want to keep non-redaction annots later, you can selectively filter.
    const node: any = (page as any).node;
    const annots = node.Annots?.();
    if (annots) {
      // We can't easily count subtype without deep parsing; use audit if provided.
      if (audit) removedRedactAnnots += audit.pages[i]?.signals.redact_annots ?? 0;
      removedOtherAnnots += 1;
      node.delete("Annots");
    }

    // 2) Heuristically strip black-rect fill ops from content streams
    const contents = node.Contents?.();
    if (!contents) continue;

    // Contents can be a single stream or an array of streams.
    const maybeArray = contents.asArray?.();
    const streams = maybeArray ?? [contents];

    for (let j = 0; j < streams.length; j++) {
      const stream = streams[j];
      if (!stream?.getContents) continue;

      const raw: Uint8Array = stream.getContents();
      if (!raw || raw.length === 0) continue;
      if (!isProbablyContentStreamText(raw)) continue;

      const text = new TextDecoder("utf-8", { fatal: false }).decode(raw);
      const { cleaned, removedEstimate } = stripCommonBlackRectFills(text);

      if (removedEstimate > 0) {
        removedOverlayOpsEstimate += removedEstimate;
        const newBytes = new TextEncoder().encode(cleaned);

        // Create new stream with updated contents
        const newStream = PDFRawStream.of(stream.dict, newBytes);

        // Replace the stream reference
        if (maybeArray) {
          // Replace in array
          maybeArray.set(j, newStream);
        } else {
          // Replace single stream
          node.set(PDFName.of('Contents'), newStream);
        }
      }
    }
  }

  const saved = await pdfDoc.save({ useObjectStreams: true });
  const cleanedBytes = new Uint8Array(saved);
  const actionsSummary = {
    removed_redact_annots_estimate: removedRedactAnnots,
    removed_annots_pages: removedOtherAnnots,
    removed_overlay_ops_estimate: removedOverlayOpsEstimate,
    note: "Overlay removal is heuristic; verify output pages listed in the audit.",
  };

  return { cleanedBytes, actionsSummary };
}
