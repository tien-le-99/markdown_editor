# Interactive Markdown Workspace

A high-performance, interactive Markdown Workspace web application featuring bidirectional WYSIWYG editing, GitHub Flavored Markdown (GFM), dynamic charts and diagrams, document navigation, and server-side PDF export.

---

## Features

- **Bidirectional WYSIWYG & GFM Editing**: Seamless real-time synchronization between the rich Tiptap/ProseMirror editor canvas and the raw Markdown source drawer.
- **Interactive Mermaid Diagrams**: Sequence diagrams, flowcharts, class diagrams, and state diagrams rendered as SVGs with `@panzoom/panzoom` controls (zoom, pan, pinch, reset).
- **Interactive Apache ECharts**: Embed line charts, bar charts, and scatter plots with interactive mousewheel `dataZoom`, drag panning, and inline error boundaries.
- **GFM Tables**: Full GitHub Flavored Markdown table support with custom cell, row, and header formatting.
- **Document Outline & Navigation**: Collapsible outline sidebar with hierarchical headings (H1–H3), active scrollspy indicator, document metrics (word count, read time, diagram count), and a floating Back-to-Top button.
- **Universal File Import**: Open any local `.md` or `.markdown` file using the file picker or drag-and-drop directly onto the workspace canvas.
- **High-Fidelity PDF Export**: Headless Playwright Chromium route handler (`/api/export-pdf`) applying `@media print` rules, transform resets, and generating vector A4 PDFs.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router) & React 18
- **Styling**: Tailwind CSS & `@tailwindcss/typography`
- **Editor Core**: Tiptap v2 / ProseMirror (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`)
- **Visuals & Charts**: Apache ECharts (`echarts`, `echarts-for-react`) & Mermaid.js (`mermaid`, `@panzoom/panzoom`)
- **Icons**: Lucide React
- **PDF Engine**: Headless Chromium via Playwright
- **Testing**: Vitest, React Testing Library, and Playwright Test

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
git clone git@github.com:tien-le-99/markdown_editor.git
cd markdown_editor
npm install
```

### Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
npm run build
npm start
```

### Running Tests

```bash
# Unit & Integration Tests (Vitest)
npm run test:unit

# End-to-End & Visual Regression Tests (Playwright)
npm run test:e2e
```

---

## License

MIT
