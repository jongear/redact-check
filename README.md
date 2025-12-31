# 🔒 redact-check

> Detect and fix improperly redacted PDFs where content was visually hidden but not actually removed.

[![Live Demo](https://img.shields.io/badge/demo-live-success?style=flat-square)](https://jongear.github.io/redact-check/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/jongear/redact-check/deploy.yml?style=flat-square)](https://github.com/jongear/redact-check/actions)

## 🎯 Overview

**redact-check** is a client-side PDF analysis and cleaning tool that identifies risky redactions in PDF documents. Many PDFs use visual redaction (black boxes) without actually removing the underlying text—this tool detects those vulnerabilities using heuristics and provides automated cleaning.

**🌐 [Try it now →](https://jongear.github.io/redact-check/)**

## ✨ Features

- 🔒 **100% Client-side** — Your PDFs never leave your browser
- 🔍 **Smart Detection** — Identifies content that appears redacted but remains in the PDF
- 📊 **Risk Assessment** — Categorizes findings by risk level (High, Medium, Low, None)
- 🧹 **Auto-Clean** — Export cleaned PDFs with problematic content removed
- 📋 **Audit Logs** — Download detailed audit reports in JSON format
- ⚡ **Fast & Secure** — No server uploads, all processing happens locally

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ and npm

### Installation & Development

```bash
# Clone the repository
git clone git@github.com:jongear/redact-check.git
cd redact-check

# Install dependencies
npm install
# or
make install

# Start development server
npm run dev
# or
make dev
```

The app will be available at `http://localhost:5173`

### Available Commands

| Command | NPM | Make | Description |
|---------|-----|------|-------------|
| **Install** | `npm install` | `make install` | Install dependencies |
| **Dev** | `npm run dev` | `make dev` | Start development server |
| **Build** | `npm run build` | `make build` | Build for production |
| **Preview** | `npm run preview` | `make preview` | Preview production build |
| **Clean** | — | `make clean` | Remove build artifacts |
| **Help** | — | `make help` | Show all make commands |

## 📖 How It Works

1. 📤 **Upload** a PDF file (stays in your browser)
2. 🔍 **Analyze** the PDF to detect potentially hidden redactions
3. 📊 **Review** flagged pages with detailed risk assessments
4. 🧹 **Clean** and export a new PDF with risky content removed
5. 💾 **Download** the cleaned PDF and audit log

## 🛠️ Tech Stack

- **[React 19](https://react.dev/)** — Modern UI framework
- **[TypeScript](https://www.typescriptlang.org/)** — Type-safe development
- **[Vite](https://vitejs.dev/)** — Lightning-fast build tool and dev server
- **[PDF.js](https://mozilla.github.io/pdf.js/)** — PDF parsing and text extraction
- **[pdf-lib](https://pdf-lib.js.org/)** — PDF manipulation and cleaning

## ⚠️ Security Notice

This tool detects **improperly redacted** PDFs where content was visually hidden but not removed. It **cannot** recover text from properly redacted PDFs where the content was actually deleted. Always use proper redaction tools (Adobe Acrobat, etc.) when handling sensitive documents.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT License - see [LICENSE](LICENSE) for details

## 💖 Support

If you find this tool useful, consider supporting its development:

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/jongear)

---

**Made with ❤️ by [jongear](https://github.com/jongear)**
