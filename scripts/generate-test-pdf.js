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

  // Draw a black rectangle over the sensitive text
  const rectWidth = 180;
  const rectHeight = 20;
  const rectX = textX - 2;
  const rectY = textY - 4;

  page.drawRectangle({
    x: rectX,
    y: rectY,
    width: rectWidth,
    height: rectHeight,
    color: rgb(0, 0, 0),
  });

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
  const outputPath = path.join(outputDir, 'redacted-test.pdf');
  fs.writeFileSync(outputPath, pdfBytes);

  console.log(`✓ Test PDF created: ${outputPath}`);
  console.log(`  Contains: "${sensitiveText}" hidden under a black rectangle`);
  console.log(`  This simulates an improperly redacted PDF.`);
}

generateTestPdf().catch(console.error);
