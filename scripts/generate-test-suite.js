import { PDFDocument, rgb, StandardFonts, PDFName } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

const ASSETS_DIR = path.join(process.cwd(), 'assets');

// Ensure assets directory exists
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

async function createBasePage(doc, titleText) {
  const page = doc.addPage([600, 800]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { height } = page.getSize();

  // Title
  page.drawText(titleText, {
    x: 50,
    y: height - 50,
    size: 14,
    font,
    color: rgb(0, 0, 0),
  });

  // Sensitive content
  page.drawText('SSN: 123-45-6789', {
    x: 50,
    y: height - 100,
    size: 12,
    font,
  });

  page.drawText('Credit Card: 4532-1234-5678-9010', {
    x: 50,
    y: height - 125,
    size: 12,
    font,
  });

  page.drawText('Email: classified@agency.gov', {
    x: 50,
    y: height - 150,
    size: 12,
    font,
  });

  return { page, font, height };
}

// Test 1: Black rectangle overlay (classic improper redaction)
async function generateOverlayBlack() {
  const doc = await PDFDocument.create();
  const { page, height } = await createBasePage(doc, 'BLACK OVERLAY TEST');

  // Black rectangles covering sensitive text
  page.drawRectangle({
    x: 85,
    y: height - 107,
    width: 110,
    height: 15,
    color: rgb(0, 0, 0),
  });

  page.drawRectangle({
    x: 135,
    y: height - 132,
    width: 200,
    height: 15,
    color: rgb(0, 0, 0),
  });

  const bytes = await doc.save();
  fs.writeFileSync(path.join(ASSETS_DIR, 'test-overlay-black.pdf'), bytes);
  console.log('✓ test-overlay-black.pdf - Black rectangles over text (HIGH RISK)');
}

// Test 2: Dark gray overlay (should still detect)
async function generateOverlayGray() {
  const doc = await PDFDocument.create();
  const { page, height } = await createBasePage(doc, 'GRAY OVERLAY TEST');

  // Very dark gray rectangles
  page.drawRectangle({
    x: 85,
    y: height - 107,
    width: 110,
    height: 15,
    color: rgb(0.08, 0.08, 0.08), // Very dark gray
  });

  page.drawRectangle({
    x: 135,
    y: height - 132,
    width: 200,
    height: 15,
    color: rgb(0.12, 0.12, 0.12), // Dark gray
  });

  const bytes = await doc.save();
  fs.writeFileSync(path.join(ASSETS_DIR, 'test-overlay-gray.pdf'), bytes);
  console.log('✓ test-overlay-gray.pdf - Dark gray rectangles (MEDIUM RISK)');
}

// Test 3: PDF Redaction annotations
async function generateAnnotationRedact() {
  const doc = await PDFDocument.create();
  const { page, height } = await createBasePage(doc, 'REDACTION ANNOTATION TEST');

  // Add redaction annotations directly to the PDF structure
  const pageNode = page.node;

  // Create redaction annotation for SSN
  const redactAnnot1 = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Redact',
    Rect: [85, height - 107, 195, height - 92],
    C: [0, 0, 0],
    IC: [0, 0, 0],
    QuadPoints: [85, height - 107, 195, height - 107, 85, height - 92, 195, height - 92],
  });

  // Create redaction annotation for credit card
  const redactAnnot2 = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Redact',
    Rect: [135, height - 132, 335, height - 117],
    C: [0, 0, 0],
    IC: [0, 0, 0],
    QuadPoints: [135, height - 132, 335, height - 132, 135, height - 117, 335, height - 117],
  });

  const ref1 = doc.context.register(redactAnnot1);
  const ref2 = doc.context.register(redactAnnot2);

  // Add to page's annotation array
  const annots = pageNode.get(PDFName.of('Annots'));
  if (annots) {
    annots.push(ref1);
    annots.push(ref2);
  } else {
    pageNode.set(PDFName.of('Annots'), doc.context.obj([ref1, ref2]));
  }

  const bytes = await doc.save();
  fs.writeFileSync(path.join(ASSETS_DIR, 'test-annotation-redact.pdf'), bytes);
  console.log('✓ test-annotation-redact.pdf - PDF Redact annotations (MEDIUM RISK)');
}

// Test 4: Mixed methods (overlay + annotations)
async function generateMixed() {
  const doc = await PDFDocument.create();
  const { page, height } = await createBasePage(doc, 'MIXED METHODS TEST');

  // Black overlay for SSN
  page.drawRectangle({
    x: 85,
    y: height - 107,
    width: 110,
    height: 15,
    color: rgb(0, 0, 0),
  });

  // Annotation for credit card
  const pageNode = page.node;
  const redactAnnot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Redact',
    Rect: [135, height - 132, 335, height - 117],
    C: [0, 0, 0],
  });
  const ref = doc.context.register(redactAnnot);
  pageNode.set(PDFName.of('Annots'), doc.context.obj([ref]));

  const bytes = await doc.save();
  fs.writeFileSync(path.join(ASSETS_DIR, 'test-mixed-methods.pdf'), bytes);
  console.log('✓ test-mixed-methods.pdf - Both overlay & annotation (HIGH RISK)');
}

// Test 5: Clean document (no redactions)
async function generateClean() {
  const doc = await PDFDocument.create();
  await createBasePage(doc, 'CLEAN DOCUMENT TEST (No Redactions)');

  const bytes = await doc.save();
  fs.writeFileSync(path.join(ASSETS_DIR, 'test-clean.pdf'), bytes);
  console.log('✓ test-clean.pdf - No redactions (CLEAN)');
}

// Test 6: Large background (should NOT flag)
async function generateLargeBackground() {
  const doc = await PDFDocument.create();
  const { page, height } = await createBasePage(doc, 'LARGE BACKGROUND TEST');

  // Draw a large black background covering >60% of page
  // Page is 600x800 = 480,000 sq units. 60% = 288,000
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 600,
    height: 500, // 300,000 sq units = 62.5% of page
    color: rgb(0, 0, 0),
  });

  const bytes = await doc.save();
  fs.writeFileSync(path.join(ASSETS_DIR, 'test-large-background.pdf'), bytes);
  console.log('✓ test-large-background.pdf - Large background >60% (should NOT flag)');
}

// Test 7: Small overlays (testing size thresholds)
async function generateSmallOverlay() {
  const doc = await PDFDocument.create();
  const { page, height } = await createBasePage(doc, 'SMALL OVERLAY TEST');

  // Very small rectangles
  page.drawRectangle({
    x: 90,
    y: height - 105,
    width: 25,
    height: 10,
    color: rgb(0, 0, 0),
  });

  page.drawRectangle({
    x: 140,
    y: height - 130,
    width: 30,
    height: 10,
    color: rgb(0, 0, 0),
  });

  const bytes = await doc.save();
  fs.writeFileSync(path.join(ASSETS_DIR, 'test-overlay-small.pdf'), bytes);
  console.log('✓ test-overlay-small.pdf - Small overlays (size threshold test)');
}

// Test 8: Elongated overlays (aspect ratio scoring)
async function generateElongated() {
  const doc = await PDFDocument.create();
  const { page, height } = await createBasePage(doc, 'ELONGATED OVERLAY TEST');

  // Elongated rectangles (>3:1 aspect ratio for +10 bonus)
  page.drawRectangle({
    x: 85,
    y: height - 105,
    width: 110,
    height: 8, // 13.75:1 aspect
    color: rgb(0, 0, 0),
  });

  page.drawRectangle({
    x: 135,
    y: height - 130,
    width: 200,
    height: 10, // 20:1 aspect
    color: rgb(0, 0, 0),
  });

  const bytes = await doc.save();
  fs.writeFileSync(path.join(ASSETS_DIR, 'test-overlay-elongated.pdf'), bytes);
  console.log('✓ test-overlay-elongated.pdf - Elongated rectangles (aspect ratio bonus)');
}

// Test 9: Multi-page with varying issues
async function generateMultiPage() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  // Page 1: Clean
  const page1 = doc.addPage([600, 800]);
  page1.drawText('PAGE 1 - CLEAN', { x: 50, y: 750, size: 14, font });
  page1.drawText('No redactions on this page.', { x: 50, y: 700, size: 12, font });

  // Page 2: Black overlay (HIGH)
  const page2 = doc.addPage([600, 800]);
  page2.drawText('PAGE 2 - BLACK OVERLAY', { x: 50, y: 750, size: 14, font });
  page2.drawText('SSN: 987-65-4321', { x: 50, y: 700, size: 12, font });
  page2.drawRectangle({
    x: 85,
    y: 695,
    width: 110,
    height: 15,
    color: rgb(0, 0, 0),
  });

  // Page 3: Annotation (MEDIUM)
  const page3 = doc.addPage([600, 800]);
  page3.drawText('PAGE 3 - ANNOTATION', { x: 50, y: 750, size: 14, font });
  page3.drawText('Account: 1234567890', { x: 50, y: 700, size: 12, font });
  const page3Node = page3.node;
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Redact',
    Rect: [110, 695, 220, 710],
    C: [0, 0, 0],
  });
  page3Node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(annot)]));

  // Page 4: Clean
  const page4 = doc.addPage([600, 800]);
  page4.drawText('PAGE 4 - ALSO CLEAN', { x: 50, y: 750, size: 14, font });
  page4.drawText('Public information only.', { x: 50, y: 700, size: 12, font });

  const bytes = await doc.save();
  fs.writeFileSync(path.join(ASSETS_DIR, 'test-multi-page.pdf'), bytes);
  console.log('✓ test-multi-page.pdf - 4 pages with varying risk levels');
}

// Main execution
async function main() {
  console.log('Generating test PDF suite...\n');

  await generateOverlayBlack();
  await generateOverlayGray();
  await generateAnnotationRedact();
  await generateMixed();
  await generateClean();
  await generateLargeBackground();
  await generateSmallOverlay();
  await generateElongated();
  await generateMultiPage();

  console.log('\n✅ Test suite generated successfully!');
  console.log('\n📁 Naming Convention:');
  console.log('  test-overlay-*.pdf      - Rectangle overlays (improper redaction)');
  console.log('  test-annotation-*.pdf   - PDF redaction annotations');
  console.log('  test-mixed-*.pdf        - Multiple redaction methods');
  console.log('  test-clean.pdf          - Control (no issues)');
  console.log('  test-large-*.pdf        - Edge cases (large backgrounds)');
  console.log('  test-multi-page.pdf     - Multiple pages with different risks');
}

main().catch(console.error);
