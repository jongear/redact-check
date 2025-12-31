import fs from 'fs';
import path from 'path';

/**
 * Creates a minimal PDF from scratch with raw PDF operators
 * This ensures the exact operator sequence we need for detection
 */
function createRawPDF() {
  // PDF structure with raw content stream containing:
  // 1. Text "top secret election plans"
  // 2. Black rectangle overlay using "0 0 0 rg" + "re" + "f" operators

  // Content stream with the exact operators
  const streamContent = `BT
/F1 16 Tf
50 742 Td
(CONFIDENTIAL DOCUMENT) Tj
ET

BT
/F1 14 Tf
50 642 Td
(top secret election plans) Tj
ET

0 0 0 rg
48 638 180 20 re
f

BT
/F1 12 Tf
50 592 Td
(This document contains information about our public outreach programs.) Tj
ET

BT
/F1 12 Tf
50 572 Td
(All public events will be held at the community center.) Tj
ET
`;

  const streamLength = streamContent.length;

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<<
  /Type /Page
  /Parent 2 0 R
  /MediaBox [0 0 612 792]
  /Contents 4 0 R
  /Resources <<
    /Font << /F1 5 0 R >>
  >>
>>
endobj

4 0 obj
<< /Length ${streamLength} >>
stream
${streamContent}endstream
endobj

5 0 obj
<<
  /Type /Font
  /Subtype /Type1
  /BaseFont /Helvetica
>>
endobj

xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000264 00000 n
0000000664 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
752
%%EOF`;

  return new TextEncoder().encode(pdf);
}

// Generate and save the PDF
const pdfBytes = createRawPDF();

const outputDir = path.join(process.cwd(), 'assets');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, 'raw-redacted-test.pdf');
fs.writeFileSync(outputPath, pdfBytes);

console.log(`✓ Raw test PDF created: ${outputPath}`);
console.log(`  Contains: "top secret election plans" with black rectangle overlay`);
console.log(`  Uses raw PDF operators: 0 0 0 rg, x y w h re, f`);
