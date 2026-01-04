# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**redact-check** is a client-side web application that detects improperly redacted PDFs where content was visually hidden (black boxes) but not actually removed from the document. It uses heuristic analysis to identify these vulnerabilities and provides automated cleaning.

## Commands

### Development
```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server (typically http://localhost:5173)
npm run build        # Build for production (runs TypeScript compiler + Vite build)
npm run preview      # Preview production build locally
npm run lint         # Run ESLint with zero warnings allowed
npm run lint:fix     # Auto-fix ESLint issues
npm test             # Run tests once (for CI)
npm run test:watch   # Run tests in watch mode (for development)
npm run test:coverage # Run tests with coverage report
```

### Test PDF Generation
```bash
npm run generate-test-suite  # Generate all test PDFs in /assets (excluded from git)
npm run generate-test-pdf    # Generate single test PDF
npm run generate-raw-pdf     # Generate raw test PDF
```

Note: Test PDFs are generated in `/assets` (gitignored). Demo PDFs for deployment are in `/public/assets` (committed to git).

## Architecture

### Core Processing Pipeline

The application follows a three-stage pipeline:

1. **Analysis (PDF.js)** - `src/pdf/analyze.ts`
   - Uses PDF.js to parse PDF content and extract text + operator lists
   - Detects dark rectangles by parsing PDF drawing operators heuristically
   - Identifies redaction annotations
   - Tests for text/rectangle overlap to find suspicious redactions
   - Generates risk scores and audit logs

2. **Cleaning (pdf-lib)** - `src/pdf/clean.ts`
   - Uses pdf-lib to manipulate PDF structure
   - Removes annotation arrays (which contain redact annotations)
   - Strips black rectangle fill operations from content streams using regex patterns
   - Returns cleaned PDF bytes

3. **Audit Logging** - `src/pdf/audit.ts`
   - Generates SHA-256 checksums
   - Provides file download helpers

### Key Heuristics

**Dark Rectangle Detection** (`detectDarkRects` in analyze.ts):
- Parses PDF operator lists to infer filled rectangles
- Tracks color state (RGB/grayscale) through operator sequences
- Filters by color darkness (≤0.15 threshold)
- Filters by size (minimum area thresholds, excludes backgrounds >60% page area)
- Version-agnostic approach using argument structure patterns

**Risk Scoring** (`scoreAndRisk` in analyze.ts):
- +40 points: Rectangle overlaps text
- +50 points: Redaction annotations present
- +15 points: Dark rectangle area ratio between 0.5-20% of page
- +10 points: Elongated rectangles (3:1 aspect ratio)
- -20 points: No text on page
- -30 points: Very large rectangles (>60% page area)
- Binary risk classification: Flagged (≥20 points), Clean (<20 points)
- Confidence score (0-100) provided for audit purposes and result sorting

**Content Stream Cleaning** (`stripCommonBlackRectFills` in clean.ts):
- Pattern A: `0 0 0 rg ... re f` (RGB black fill + rectangle + fill operator)
- Pattern B: `0 g ... re f` (grayscale black fill + rectangle + fill operator)
- Conservative regex matching with line-count limits to avoid over-matching
- Only processes streams that are >70% ASCII (text-based content streams)

### PDF Library Usage

**PDF.js** (analysis only):
- Configure worker: `pdfjs.GlobalWorkerOptions.workerSrc` must point to worker file
- Vite-friendly setup uses `import.meta.url` for worker path
- Methods used: `getDocument`, `getPage`, `getViewport`, `getTextContent`, `getOperatorList`, `getAnnotations`

**pdf-lib** (manipulation only):
- Loaded with `ignoreEncryption: true` for maximum compatibility
- Directly manipulates PDF node structure via `(page as any).node`
- Content streams accessible via `node.Contents()` (can be single stream or array)
- Save with `useObjectStreams: true` for optimization

### Data Flow

```
User uploads PDF → File → ArrayBuffer → Uint8Array
                                          ↓
                    ┌─────────────────────┴──────────────────────┐
                    ↓                                             ↓
              PDF.js Analysis                               pdf-lib Cleaning
           (src/pdf/analyze.ts)                          (src/pdf/clean.ts)
                    ↓                                             ↓
              AuditLog object                           Cleaned Uint8Array
                    ↓                                             ↓
            UI displays risk table                    Download cleaned PDF
```

### Type System

Core types defined in `src/pdf/types.ts`:
- `PageAudit`: Per-page analysis results with risk level, confidence score, signals, and findings
- `AuditLog`: Complete analysis report with schema version, source metadata, and page audits
- `Risk`: Binary classification ("flagged" | "none")
- `PageFinding`: Union type for detected issues (overlay rectangles or redaction annotations)

### UI State Management

**App.tsx** - Main application with two modes:

1. **Single File Mode** - Uses React hooks for state:
   - `file/bytes`: Original PDF data
   - `audit`: Analysis results from PDF.js
   - `cleanedBytes/cleanSummary`: Results from pdf-lib cleaning
   - `status`: User-facing status messages
   - `flaggedPages`: Memoized sorted list of risky pages (sorted by confidence)

2. **Batch Mode** - Processes multiple PDFs:
   - `jobs`: Array of `PdfJobState` tracking each file's processing status
   - Background processing with concurrent analysis (up to 3 files at once)
   - BatchAuditLog consolidates results from all files

**Components**:
- `DemoFiles.tsx`: Expandable demo file list with risk badges
- `FileItem.tsx`: Individual file processing UI in batch mode
- `BatchSummary.tsx`: Aggregate statistics across all processed files
- `RiskBadge.tsx`: Color-coded risk level indicator

**Hooks**:
- `useDownloads.ts`: Centralized file download logic for PDFs and audit logs

### Build & Deployment

**Vite Configuration** (`vite.config.ts`):
- Base path: `/redact-check/` (GitHub Pages deployment)
- Assets include: `**/*.pdf` (allows importing PDFs as static assets)
- Demo PDFs must be in `/public/assets` to be included in build output

**GitHub Actions Workflows**:
- `build.yml`: Reusable workflow (lint → test → build) using Node 22
- `ci.yml`: Runs on PRs and feature branches, calls `build.yml`, posts PR comment
- `deploy.yml`: Runs on main branch, calls `build.yml`, deploys to GitHub Pages, creates release

**Testing**:
- Framework: Vitest with jsdom environment
- Test setup: `src/test/setup.ts` extends expect with @testing-library/jest-dom matchers
- Global test utilities via `vitest.config.ts` (globals: true)
- Component tests use @testing-library/react

## Important Notes

- All PDF processing happens client-side (no server uploads)
- Heuristics are intentionally conservative to avoid false positives
- The tool cannot recover properly redacted PDFs where content was actually removed
- Dark rectangle detection is version-agnostic but may over/under-detect in complex PDFs
- Content stream cleaning uses regex patterns that may not catch all overlay techniques (XObjects, complex drawing paths, etc.)
