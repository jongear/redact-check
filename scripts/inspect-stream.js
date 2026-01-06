import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import pako from 'pako';

async function inspectStream() {
  const pdfPath = path.join(process.cwd(), 'public', 'assets', 'test-multi-page.pdf');
  const bytes = fs.readFileSync(pdfPath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  const pages = doc.getPages();
  console.log(`\nTotal pages: ${pages.length}\n`);

  // Inspect page 2 (index 1) - has black overlay
  console.log('========== PAGE 2 (BLACK OVERLAY) ==========');
  await inspectPage(doc, pages[1], 2);

  // Inspect page 3 (index 2) - has annotation + overlay
  console.log('\n========== PAGE 3 (ANNOTATION + OVERLAY) ==========');
  await inspectPage(doc, pages[2], 3);
}

async function inspectPage(doc, page, pageNum) {
  const node = page.node;
  const contents = node.Contents?.();

  if (!contents) {
    console.log(`No contents found on page ${pageNum}`);
    return;
  }

  const maybeArray = contents.asArray?.();
  const streams = maybeArray ?? [contents];

  console.log(`Page ${pageNum} has ${streams.length} content stream(s)\n`);

  for (let i = 0; i < streams.length; i++) {
    let stream = streams[i];

    // Dereference if it's a PDFRef
    if (stream?.constructor?.name?.includes('PDFRef')) {
      stream = doc.context.lookup(stream);
    }

    if (!stream?.getContents) {
      console.log(`Stream ${i}: No getContents method`);
      continue;
    }

    const raw = stream.getContents();

    // Get filter from dict
    const filterObj = stream.dict?.get?.(PDFDocument.create().then(d => d.context.obj('Filter')));
    const filterName = stream.dict?.lookup('Filter')?.toString() || '';

    console.log(`Stream ${i}:`);
    console.log(`  Raw size: ${raw.length} bytes`);
    console.log(`  Filter detected: ${filterName || 'none'}`);

    // Try to decompress - check magic bytes for zlib/deflate (0x78 0x9C)
    let decoded = raw;
    let wasCompressed = false;

    // Check if it's compressed by looking at magic bytes
    const isCompressed = raw[0] === 0x78 && (raw[1] === 0x9C || raw[1] === 0x01 || raw[1] === 0xDA);

    if (isCompressed || filterName.includes('FlateDecode') || filterName.includes('Fl')) {
      try {
        decoded = pako.inflate(raw);
        wasCompressed = true;
        console.log(`  Decompressed size: ${decoded.length} bytes`);
      } catch (e) {
        console.log(`  Decompression failed: ${e.message}`);
      }
    }

    const text = new TextDecoder("utf-8", { fatal: false }).decode(decoded);
    console.log(`\n--- Stream ${i} Content ---`);
    console.log(text);
    console.log(`--- End Stream ${i} ---\n`);

    // Show hex dump of first 200 bytes for debugging
    console.log(`--- First 200 bytes (hex) ---`);
    const hex = Array.from(decoded.slice(0, 200))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    console.log(hex);
    console.log(`---\n`);
  }
}

inspectStream().catch(console.error);
