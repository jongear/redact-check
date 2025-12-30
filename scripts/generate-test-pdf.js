import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

async function generateTestPdf() {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();

  // Add a page
  const page = pdfDoc.addPage([600, 400]);
  const { width, height } = page.getSize();

  // Add some context text
  page.drawText('CONFIDENTIAL DOCUMENT', {
    x: 50,
    y: height - 50,
    size: 16,
  });

  // Add the sensitive text that should be redacted
  const sensitiveText = 'top secret election plans';
  const textX = 50;
  const textY = height - 150;
  const textSize = 14;

  page.drawText(sensitiveText, {
    x: textX,
    y: textY,
    size: textSize,
  });

  // Draw a black rectangle over the sensitive text using RAW PDF operators
  // This matches the pattern that the detector looks for:
  // 0 0 0 rg (set fill color to black RGB)
  // x y w h re (rectangle path)
  // f (fill)
  const rectWidth = 180;
  const rectHeight = 20;
  const rectX = textX - 2;
  const rectY = textY - 4;

  // Inject raw PDF operators into the page's content stream
  // This simulates how someone might manually edit a PDF to add a black box
  const rawOperators = `
0 0 0 rg
${rectX} ${rectY} ${rectWidth} ${rectHeight} re
f
`;

  // Get the current page content and append our raw operators
  const pageNode = page.node;
  const contents = pageNode.Contents();

  if (contents) {
    // Contents can be a single stream or an array of streams
    const maybeArray = contents.asArray?.();
    const streams = maybeArray ?? [contents];

    // Append to the last stream
    for (const stream of streams) {
      if (!stream || typeof stream.getContents !== 'function') continue;

      try {
        const existingContent = new TextDecoder().decode(stream.getContents());
        const newContent = existingContent + rawOperators;
        stream.setContents(new TextEncoder().encode(newContent));
        break; // Only modify the first valid stream
      } catch (err) {
        console.warn('Could not modify stream:', err);
      }
    }
  }

  // Add some more innocent text below
  page.drawText('This document contains information about our public outreach programs.', {
    x: 50,
    y: textY - 50,
    size: 12,
  });

  page.drawText('All public events will be held at the community center.', {
    x: 50,
    y: textY - 70,
    size: 12,
  });

  // Save the PDF
  const pdfBytes = await pdfDoc.save();

  // Ensure the assets directory exists
  const outputDir = path.join(process.cwd(), 'assets');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write to file
  const outputPath = path.join(outputDir, 'improperly-redacted-test.pdf');
  fs.writeFileSync(outputPath, pdfBytes);

  console.log(`✓ Test PDF created: ${outputPath}`);
  console.log(`  Contains: "${sensitiveText}" hidden under a black rectangle`);
  console.log(`  This simulates an improperly redacted PDF.`);
}

generateTestPdf().catch(console.error);
