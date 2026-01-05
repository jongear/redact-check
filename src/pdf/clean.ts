import { PDFDocument, PDFRawStream, PDFName } from "pdf-lib";
import type { AuditLog } from "./types";
import pako from "pako";

/**
 * Heuristic filter that attempts to remove common "black rectangle overlay" ops.
 * Targets patterns like:
 *   Pattern A/B: 0 0 0 rg ... x y w h re ... f (using re operator)
 *   Pattern C/D: 0 0 0 rg ... m ... l ... h f (using path operators)
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

  const outA = src.replace(patternA, () => {
    removed += 1;
    // Remove the whole block; keep a harmless no-op comment for debugging
    return "\n% stripped_suspected_black_rect_fill\n";
  });

  // Pattern B: gray fill black "0 g ... re f"
  const patternB =
    /(?:^|\n)\s*0(\.0+)?\s+g\s*\n(?:[^\n]{0,200}\n){0,6}?\s*(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)\s+(\d+(\.\d+)?)\s+(\d+(\.\d+)?)\s+re\s*\n\s*(f|f\*|B|B\*)\s*(?=\n|$)/g;

  const outB = outA.replace(patternB, () => {
    removed += 1;
    return "\n% stripped_suspected_black_rect_fill\n";
  });

  // Pattern C: "q ... 0 0 0 rg ... m ... l ... h ... f ... Q" (RGB black path-based rect)
  // Matches save-state, black fill, path construction, fill, restore
  // IMPORTANT: Must NOT contain BT (begin text) to avoid matching text blocks
  const patternC =
    /(?:^|\n)q\s*\n(?:(?!BT)[^\n]{0,200}\n){0,15}?\s*0(\.0+)?\s+0(\.0+)?\s+0(\.0+)?\s+rg\s*\n(?:(?!BT)[^\n]{0,200}\n){0,15}?\s*(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)\s+m\s*\n(?:(?!BT)[^\n]{0,200}\n){0,15}?\s*h\s*\n\s*f\s*\n\s*Q\s*(?=\n|$)/g;

  const outC = outB.replace(patternC, () => {
    removed += 1;
    return "\n% stripped_suspected_black_rect_fill_path\n";
  });

  // Pattern D: "q ... 0 g ... m ... l ... h ... f ... Q" (Gray black path-based rect)
  // IMPORTANT: Must NOT contain BT (begin text) to avoid matching text blocks
  const patternD =
    /(?:^|\n)q\s*\n(?:(?!BT)[^\n]{0,200}\n){0,15}?\s*0(\.0+)?\s+g\s*\n(?:(?!BT)[^\n]{0,200}\n){0,15}?\s*(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)\s+m\s*\n(?:(?!BT)[^\n]{0,200}\n){0,15}?\s*h\s*\n\s*f\s*\n\s*Q\s*(?=\n|$)/g;

  const outD = outC.replace(patternD, () => {
    removed += 1;
    return "\n% stripped_suspected_black_rect_fill_path\n";
  });

  return { cleaned: outD, removedEstimate: removed };
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

export async function cleanPdf(bytes: Uint8Array, audit?: AuditLog): Promise<{
  cleanedBytes: Uint8Array;
  actionsSummary: {
    removed_redact_annots_estimate: number;
    removed_annots_pages: number;
    removed_overlay_ops_estimate: number;
    note: string;
  };
}> {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (page as any).node;
    const annots = node.Annots?.();
    if (annots) {
      // We can't easily count subtype without deep parsing; use audit if provided.
      if (audit) removedRedactAnnots += audit.pages[i]?.signals.redact_annots ?? 0;
      removedOtherAnnots += 1;
      node.delete(PDFName.of('Annots'));
    }

    // 2) Heuristically strip black-rect fill ops from content streams
    const contents = node.Contents?.();
    if (!contents) continue;

    // Contents can be a single stream or an array of streams.
    const maybeArray = contents.asArray?.();
    const streams = maybeArray ?? [contents];

    for (let j = 0; j < streams.length; j++) {
      let stream = streams[j];

      // Dereference if it's a PDFRef
      if (stream?.constructor?.name?.includes('PDFRef')) {
        stream = pdfDoc.context.lookup(stream);
      }

      if (!stream?.getContents) continue;

      // Get raw contents (may be compressed)
      const raw: Uint8Array = stream.getContents();
      if (!raw || raw.length === 0) continue;

      // Decompress if stream has FlateDecode filter OR if it's compressed by magic bytes
      let decoded = raw;
      let wasCompressed = false;
      const filter = stream.dict?.get?.(PDFName.of('Filter'));

      // Check magic bytes for zlib/deflate compression (0x78 0x9C, 0x78 0x01, 0x78 0xDA)
      const hasZlibMagic = raw.length >= 2 && raw[0] === 0x78 &&
                          (raw[1] === 0x9C || raw[1] === 0x01 || raw[1] === 0xDA);

      if (filter) {
        const filterName = filter.toString();
        if (filterName === '/FlateDecode' || filterName === '/Fl') {
          try {
            // Decompress using pako
            decoded = pako.inflate(raw);
            wasCompressed = true;
          } catch (e) {
            // If decompression fails, try processing raw anyway
            console.warn(`Failed to decompress FlateDecode stream on page ${i + 1}: ${e}`);
          }
        }
      } else if (hasZlibMagic) {
        // Stream is compressed but Filter entry is missing - decompress anyway
        try {
          decoded = pako.inflate(raw);
          wasCompressed = true;
        } catch (e) {
          // If decompression fails, continue with raw bytes
          console.warn(`Failed to decompress stream with zlib magic on page ${i + 1}: ${e}`);
        }
      }

      // Check if the decoded stream is text-like
      if (!isProbablyContentStreamText(decoded)) continue;

      const text = new TextDecoder("utf-8", { fatal: false }).decode(decoded);
      const { cleaned, removedEstimate } = stripCommonBlackRectFills(text);

      if (removedEstimate > 0) {
        removedOverlayOpsEstimate += removedEstimate;
        const newBytes = new TextEncoder().encode(cleaned);

        // Clone the dict and remove the Filter if it was compressed
        const newDict = stream.dict.clone();
        if (wasCompressed) {
          newDict.delete(PDFName.of('Filter'));
          // Also update the Length to match new uncompressed size
          newDict.set(PDFName.of('Length'), pdfDoc.context.obj(newBytes.length));
        }

        // Create new stream with updated contents and dict
        const newStream = PDFRawStream.of(newDict, newBytes);

        // Register the new stream with the PDF context and set the reference
        const streamRef = pdfDoc.context.register(newStream);
        node.set(PDFName.of('Contents'), streamRef);
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
