
# redact-check

Detects improperly redacted PDFs where content was hidden but not removed.

## Overview

**redact-check** is a client-side PDF analysis and cleaning tool designed to identify risky redactions in PDF documents. Many PDFs use visual redaction (black boxes) without actually removing the underlying text—this tool detects those vulnerabilities using heuristics and provides an automated cleaning mechanism.

### Features

- **Client-side processing** - Your PDFs never leave your browser
- **Detects hidden text** - Identifies content that appears redacted but remains in the PDF
- **Risk assessment** - Categorizes findings by risk level (High, Medium, Low, None)
- **Automated cleaning** - Export cleaned PDFs with problematic content removed
- **Audit logs** - Download detailed audit reports in JSON format

## Getting Started Locally

### Prerequisites

- Node.js 16+ and npm

### Installation

1. Clone the repository:
```bash
git clone git@github.com:jongear/redact-check.git
cd redact-check
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or another port if 5173 is in use).

### Building for Production

```bash
npm run build
```

The compiled files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## How It Works

1. **Upload** a PDF file (stays in your browser)
2. **Analyze** the PDF to detect potentially hidden redactions
3. **Review** flagged pages with detailed risk assessments
4. **Clean** and export a new PDF with risky content removed
5. **Download** the cleaned PDF and audit log

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server
- **PDF.js** - PDF parsing and text extraction
- **pdf-lib** - PDF manipulation and cleaning

---

## Support

If you find this tool useful, consider supporting its development:

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/jongear)

<!-- 
Or donate via:
- [Ko-fi](https://ko-fi.com/yourname)
- [GitHub Sponsors](https://github.com/sponsors/yourname)
 -->
