# AGENTS.md — Developer & AI Agent Guide

Welcome to the **Interactive Markdown Workspace** codebase. This guide serves as the definitive reference for AI agents and human engineers editing, maintaining, and extending this repository.

---

## 1. Project Overview & Architecture

This application is a production-grade, interactive Markdown Workspace web application featuring:
* **Bidirectional WYSIWYG & GFM Synchronization**: Seamless real-time editing between Tiptap ProseMirror canvas and raw Markdown side drawer.
* **Interactive ECharts NodeView**: Apache ECharts integration with mousewheel `dataZoom`, drag-panning, preset switching, and inline error boundaries.
* **Interactive Mermaid.js NodeView**: Mermaid sequence/flowchart diagrams rendered as SVGs with `@panzoom/panzoom` (zoom, pan, pinch, reset) and live syntax editing.
* **GFM-Compliant Resizable Tables**: ProseMirror table extension with resizable column handles and markdown table serialization.
* **Native KaTeX LaTeX Math Support**: Inline `$formula$` and display block `$$formula$$` / ```` ```math ```` with live syntax editing, presets (quadratic, Euler, Gaussian, matrix), and bidirectional AST synchronization.
* **High-Fidelity Server-Side PDF Export**: Headless Playwright Chromium route handler (`/api/export-pdf`) applying `@media print` rules, transform resets, and streaming A4 vector PDFs.

---

## 2. Technology Stack

| Layer | Technology | Key Packages |
| :--- | :--- | :--- |
| **Framework** | Next.js 14 (App Router) | `next`, `react`, `react-dom` |
| **Styling** | Tailwind CSS + Typography | `tailwindcss`, `@tailwindcss/typography`, `lucide-react` |
| **Editor Core** | Tiptap v2 / ProseMirror | `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, `tiptap-markdown` |
| **Tables** | Tiptap Table Extensions | `@tiptap/extension-table`, `-row`, `-cell`, `-header` |
| **Charts** | Apache ECharts | `echarts`, `echarts-for-react` |
| **Diagrams** | Mermaid.js + Panzoom | `mermaid`, `@panzoom/panzoom` |
| **Math & LaTeX** | KaTeX | `katex`, `@types/katex` |
| **PDF Generation** | Headless Chromium | `playwright` (server-side route handler) |
| **Unit Testing** | Vitest + RTL | `vitest`, `@testing-library/react`, `jsdom` |
| **E2E & Visual Testing** | Playwright Test | `@playwright/test` (interactions + pixel diff snapshots) |

---

## 3. Directory Layout

```
markdown_editor/
├── package.json                         # Scripts, dependencies, and engine specs
├── tsconfig.json                        # Path aliases (@/* -> ./src/*)
├── next.config.mjs                      # Webpack externals for Playwright
├── tailwind.config.ts                   # Brand palette & typography configuration
├── postcss.config.mjs                   # PostCSS plugins
├── vitest.config.ts                     # Unit test configuration with JSDOM
├── playwright.config.ts                 # E2E & visual regression snapshot config
├── AGENTS.md                            # This guide for AI sessions
│
├── src/
│   ├── app/
│   │   ├── layout.tsx                   # Root HTML5 layout with metadata
│   │   ├── page.tsx                     # Home page mount (dynamic client import)
│   │   ├── globals.css                  # ProseMirror styling, table handles & print import
│   │   └── api/
│   │       └── export-pdf/
│   │           └── route.ts             # Playwright PDF generation handler
│   │
│   ├── components/
│   │   └── editor/
│   │       ├── Editor.tsx               # Top-level editor coordinator & state sync
│   │       ├── Toolbar.tsx              # Formatting tools, table tools, PDF trigger
│   │       ├── MarkdownDrawer.tsx       # Real-time GFM source drawer
│   │       ├── extensions/
│   │       │   ├── EChartsNode.tsx       # ECharts custom Node & NodeView
│   │       │   ├── MermaidNode.tsx       # Mermaid custom Node & Panzoom NodeView
│   │       │   ├── MathBlockNode.tsx     # KaTeX block Math Node & NodeView
│   │       │   ├── MathInlineNode.tsx    # KaTeX inline Math Node & NodeView
│   │       │   ├── TableExtensions.ts   # Resizable GFM table extension
│   │       │   └── index.ts             # Extension barrel export
│   │       └── utils/
│   │           ├── default-content.ts   # Default sample document
│   │           └── markdown-serializer.ts # Bidirectional AST Markdown <-> HTML
│   └── styles/
│       └── print.css                    # Production print styles & page-break rules
│
├── tests/
│   ├── setup.ts                         # Vitest setup (Proxy Canvas2D & ResizeObserver mocks)
│   ├── unit/
│   │   ├── markdown-serializer.test.ts  # Markdown roundtripping & formatting
│   │   ├── math-serializer.test.ts      # LaTeX inline and display math roundtripping
│   │   ├── table-state.test.ts          # Table matrix & column calculations
│   │   ├── chart-parser.test.tsx        # ECharts parser resilience & error boundary
│   │   ├── toc-navigation.test.tsx      # Slugification & TOC anchor link roundtripping
│   │   ├── toolbar-buttons.test.tsx     # Toolbar button triggers, formatting & modals
│   │   ├── drawer-buttons.test.tsx      # Markdown drawer copy, toggle & close buttons
│   │   ├── outline-buttons.test.tsx     # Document outline navigation & close buttons
│   │   ├── echarts-node-buttons.test.tsx # ECharts presets, formatting, fullscreen & save
│   │   ├── mermaid-node-buttons.test.tsx # Mermaid panzoom controls, presets & save
│   │   └── math-node-buttons.test.tsx   # KaTeX formula presets, edit modal & save
│   └── e2e/
│       ├── editor-interactions.spec.ts  # Hydration, bidirectional sync & PDF export
│       └── visual-regression.spec.ts    # Visual snapshot regression tests
└── scripts/
    └── inspect-ui.mjs                   # Automation script for UI inspection captures
```

---

## 4. Key Architectural Patterns & Gotchas

### 4.1. Bidirectional Markdown Synchronization
* **Sync Loop Prevention**: In [Editor.tsx](file:///d:/JSProjects/markdown_editor/src/components/editor/Editor.tsx), bidirectional updates between the Tiptap canvas and the raw Markdown drawer are guarded by `isUpdatingRef`. Always maintain this lock when dispatching programmatic content updates (`editor.commands.setContent`) or serializing (`htmlToMarkdown`) to prevent recursive feedback loops.
* **Nested Blockquote Content**: `markdownToHtml` recursively parses the de-prefixed body of `>` quotes, so headings, GFM tables, fenced code and rules inside a pasted message keep their block structure instead of collapsing into one italic paragraph. `htmlToMarkdown` prefixes every serialized line back with `> ` (blank lines become `>`), and `DocumentOutline` strips quote markers plus normalizes CRLF before detecting headings.
* **Lossless Code Fence Serialization**: In [markdown-serializer.ts](file:///d:/JSProjects/markdown_editor/src/components/editor/utils/markdown-serializer.ts), custom code blocks (```` ```echarts ```` and ```` ```mermaid ````) store their code in the DOM using `encodeURIComponent(code)` inside the `data-code` attribute.
  * **Why**: Standard HTML parsers corrupt characters like `>` into `&gt;`, which breaks Mermaid sequence diagram syntax (e.g. `User->>Server:`).
  * **Rule**: When reading or writing `data-code`, always use `encodeURIComponent` / `decodeURIComponent`.

### 4.2. ECharts NodeView
* **ECharts Component**: Implemented in [EChartsNode.tsx](file:///d:/JSProjects/markdown_editor/src/components/editor/extensions/EChartsNode.tsx).
* **Cartesian Axes Requirement**: ECharts `line` and `bar` series require both `xAxis` and `yAxis`. If missing, ECharts throws a runtime error.
* **Graceful Error Boundary**: `parsedOption` is calculated inside a `useMemo` wrapped with a try-catch. If JSON parsing or chart rendering fails, the component displays an inline repair banner with options to "Repair JSON Syntax" or "Reset to Default Preset" rather than crashing ProseMirror.
* **Resize Handling**: Every instance connects a `ResizeObserver` to its container and calls `chartInstance.resize()`. Always disconnect observers and dispose instances on unmount.

### 4.3. Mermaid NodeView & Panzoom
* **Mermaid Rendering**: Handled in [MermaidNode.tsx](file:///d:/JSProjects/markdown_editor/src/components/editor/extensions/MermaidNode.tsx). Uses `mermaid.render(id, code)` to inject SVG.
* **Panzoom Controls**: Wrapped in `@panzoom/panzoom`. The zoom level state is initialized to `100` (representing 100%). Zoom range is 25%–1000% (`MERMAID_MIN_ZOOM`/`MERMAID_MAX_ZOOM`) so dense connector bundles stay inspectable; SVG stays vector-sharp at any scale.
* **Line-Hop Bridges at Edge Crossings**: Flowchart connectors use `curve: 'stepBefore'` (orthogonal right-angle routing; basis splines bowed label midpoints into neighbors) with generous `nodeSpacing: 60` / `rankSpacing: 80`. After render, [mermaid-linehops.ts](file:///d:/JSProjects/markdown_editor/src/components/editor/utils/mermaid-linehops.ts) post-processes the SVG markup string (`applyLineHopsToSvgMarkup`): every crossing between `g.edgePaths` polylines gains a semicircular hop (radius 8, so stacked hops on a bundle never touch the neighboring line) on the later edge, circuit-diagram style. Only absolute M/L/H/V paths qualify (curved/relative paths are skipped); crossings within 25 units of a path end (`LINE_HOP_END_MARGIN`, arrowheads) or within 10 units of a path start (`LINE_HOP_START_MARGIN`, origin box connections) or between near-parallel segments are skipped; near-coincident crossings on one segment merge into a single hop; the function never throws (returns input unchanged on any failure). Hops are baked into the markup before React state, so pan/zoom and the PDF export clone inherit them automatically. Sequence diagrams have no `g.edgePaths` and pass through byte-identical.
* **Orthogonal Node Avoidance for Connectors**: Dagre routes long edges through foreign node boxes (which then paint UNDER the boxes since `edgePaths` precedes `nodes`). [mermaid-avoidance.ts](file:///d:/JSProjects/markdown_editor/src/components/editor/utils/mermaid-avoidance.ts) post-processes the markup first (`applyNodeAvoidanceToSvgMarkup`, before hops): axis-aligned segments clipping a foreign node box are rebuilt with a rectangular U-detour hugging the box at 15 units clearance, runs tracing cluster frame borders are shifted out to clear lanes (dagre parks edges exactly on border coordinates), and collinear edge bundles are separated into individual ±lane/±2-lane offsets (later paths move around earlier placed geometry, never onto frames). Bundle detection uses a window equal to the lane, so Line-gap visibly respaces the whole tight bundle; pill/label guards are sized per candidate sweep (a pill blocking only a far lane never vetoes a free near lane). When every lane is neighbor-crowded, exact overlaps (below 8 units) still split onto the roomiest hard-valid lane (best-effort, ≥8 clearance) instead of staying merged; readable-but-tight pairs keep the strict veto and stay straight. Shift windows trim inward past end-grazing blockers (`trimShiftWindow`, hairline budget 2×boxPadding+8) so one grazing box edge cannot veto separating a long merged run; deeper intrusions keep the veto. Skipped when the disturbed zone reaches an edge-label pill rect, comes near a path end (arrowheads), or collides with another box. Cluster backgrounds are excluded; diagonal segments are untouched.
  * **Nested Concentric Detours**: When multiple edges clip the same obstacle box on the same side, `detourAroundBoxes` evaluates candidate clearances using decoupled travel clearance ($baseClearance + layer \times 10$ for entry/exit drops) and full lane clearance ($baseClearance + layer \times laneWidth$ for the detour lane). This guarantees concentric detour lanes maintain at least full lane separation ($\ge laneWidth$), preventing Pass 3 (`separateOverlappingRuns`) from misdetecting concentric detours as overlapping bundles ($< detectWindow$) and creating stepped jogs, while keeping outer drops safely within cluster frame margins without triggering border-hug vetoes. Outer paths step cleanly outward into concentric nested U-detours, preventing overlapping drops and eliminating self-intersecting corner hops.
  * **Closer Detour Side Preference**: In `detourAroundBoxes`, candidate detour sides compare the travel offset distance to the obstacle box boundary (`negDist <= posDist`), prioritizing the shorter detour side around the obstacle rather than the farther edge.
  * **Direct Connector Priority Over Intruding Through-Lines**: In `applyNodeAvoidanceToSvgMarkup`, path elements that do not clip any obstacle boxes are prioritized for geometry placement in `placed` ahead of paths that clip foreign boxes. Direct connectors (e.g. entering terminal node ports) keep their straight axis, while long-distance bypass lines take outer detour and unbundled offset lanes rather than forcing terminal connectors into ugly jogs right before arrowheads.
  * **Entrance-Oriented Unbundling**: In `separateOverlappingRuns`, candidate offset lane steps (`allowedSteps`) check the path's arrival vector via `prevPt`. Paths entering from the negative/upper side try negative offset lanes first (`[-1, 1]`), while paths entering from the positive side try positive lanes first (`[1, -1]`). This prevents detoured paths from unnecessarily crossing the centerline over straight placed edges.
  * **Polyline Simplification & Spur Elimination**: When shifting segments onto parallel offset lanes in `separateOverlappingRuns`, if a path subsequently undergoes box detour or connects to adjacent points, unneeded step-back points (`at(laneU1)`) could introduce collinear redundancies or 180° backtracking "needles/spurs" that briefly spike back into adjacent lanes before turning. All rebuilt and shifted paths pass through `simplifyPolyline`: consecutive duplicate points are dropped, collinear monotonic segments are collapsed, and 180° backtracking spikes (`A -> B -> A` or collinearly reversing spurs) are completely pruned before paths are stored and emitted to SVG `d`.
* **Cluster Transparency & Connector Styling**: Mermaid paints per-cluster accent fills as INLINE !important styles (beats any stylesheet rule), so overlapping frames hide boxes/titles underneath. `applyClusterTransparencyToSvgMarkup` neutralizes each cluster rect fill inline (borders keep colors/widths) and shares one style tag with the connector rules (2.5-unit strokes, round joins for hops/detours; fixed-size markers keep arrowheads intact).
* **Per-Diagram Layout Settings (live)**: Each Mermaid node stores `curve` (`stepBefore` default + 7 d3 routings), `nodeSpacing` (60), `rankSpacing` (80), `padding` (20), `lineGap` (20, slider 8–48), and `boxGap` (15, slider 8–40) as node attrs, tuned via the header layout popover ([MermaidNode.tsx](file:///d:/JSProjects/markdown_editor/src/components/editor/extensions/MermaidNode.tsx) `sanitizeMermaidLayout` + `numberAttrOr`). Attr edits re-run the render effect immediately. `lineGap` overrides the bundle lane in `applyNodeAvoidanceToSvgMarkup` (stacked-run clearance scales at 60% of lane); `boxGap` overrides the node-avoidance detour clearance (U-detour moat around boxes); hop radius auto-fits via `hopRadiusForLineGap` (capped at 8, shrinks so the arc diameter stays under narrow lanes). Renders go through a module-level promise queue so the global `mermaid.initialize` + `render` pair never interleaves across diagrams; a sequence guard lets only the latest render commit. A Config JSON box in the same popover shows the stored layout and overwrites it wholesale on Apply (`parseMermaidLayoutJson`: flat keys or a nested `flowchart` object; validated/clamped, invalid input keeps the old config with an error). Orthogonal curves keep node-avoidance/hop post-processing; curvy beziers skip those passes gracefully (UI warns). Gotcha: `Number(null) === 0`, so `parseHTML` must null-check missing data-attrs or fresh diagrams parse spacing as 0. Like `pdfLayout`, settings are session-only — the Markdown fence keeps code alone.
* **Print Normalization**: In [print.css](file:///d:/JSProjects/markdown_editor/src/styles/print.css), `.mermaid-node-container svg` and `.panzoom-wrapper svg` have `transform: none !important;` to ensure diagrams print unscaled and centered.

### 4.4. KaTeX Math NodeViews & Layout Sizing
* **KaTeX Rendering**: Implemented in [MathBlockNode.tsx](file:///d:/JSProjects/markdown_editor/src/components/editor/extensions/MathBlockNode.tsx) and [MathInlineNode.tsx](file:///d:/JSProjects/markdown_editor/src/components/editor/extensions/MathInlineNode.tsx). Uses `katex.renderToString` with lossless `encodeURIComponent` serialization.
* **Document Canvas Expansion**: In [Editor.tsx](file:///d:/JSProjects/markdown_editor/src/components/editor/Editor.tsx), `<main>` uses `items-start` (`align-items: flex-start`) and the document container uses `h-fit`. This ensures the white paper sheet dynamically wraps documents of any height without clipping.

### 4.5. Server-Side PDF Engine & Layout Controls
* **Handler Route**: [route.ts](file:///d:/JSProjects/markdown_editor/src/app/api/export-pdf/route.ts).
* **Browser Launch Args**: Always launch Chromium with `--no-sandbox`, `--disable-setuid-sandbox`, and `--disable-dev-shm-usage`.
* **BodyInit Type in App Router**: Playwright's `page.pdf()` returns a Node `Buffer`. In Next.js App Router, `Response` accepts `ArrayBufferView` or `Uint8Array`. Always wrap the buffer: `new Response(new Uint8Array(pdfBuffer), { status: 200, ... })`.
* **Native Document Outlines (Bookmarks Tree) & Tagged PDF**: When generating PDFs via Playwright, always pass `{ outline: true, tagged: true }` in `page.pdf()` options. This generates a native PDF Bookmarks / Document Outlines tree (`/Outlines`) matching HTML heading hierarchy (`h1` -> `h6`), enabling side-panel navigation in PDF viewers (Edge, Chrome, Acrobat).
* **Anchor & Link Styling Isolation**: All hyperlink styling (`color`, `text-decoration`) must be strictly scoped to `a[href]`. Empty named anchors (`<a id="..."></a>`) or alias target points must have `a:not([href]), .anchor-point { text-decoration: none !important; border: none !important; }` and zero-dimension styling (`position: absolute; width: 0; height: 0; overflow: hidden;`) to prevent PDF renderers from displaying stray blue underlines or dashes beneath/before headings.
* **TOC Link Generation & Slug Normalization**: Headings automatically generate standard slugs (`id="${slug}"`) and fallback alias anchors (`<a id="${alias}"></a>`). Dotted hierarchical numbers (e.g. `2.1`) produce both prefixed and clean numeric aliases. Non-hierarchical numbers with trailing periods (e.g. `1. Introduction`) should NOT strip the dot into a lone number `1` to avoid collisions.
* **Configurable Diagram PDF Layout**: In [Toolbar.tsx](file:///d:/JSProjects/markdown_editor/src/components/editor/Toolbar.tsx), users can configure global Mermaid diagram PDF layout modes via a settings popover:
  * **Enlarged Upright Page Mode** (default): Generates a custom wide `@page` for wide diagrams so text remains upright and legible without clipping.
  * **Rotate 90° Portrait Mode**: Rotates wide diagrams 90 degrees on standard A4 portrait pages with page breaks before and after.
  * **Fit to Page Mode**: Scales down SVG diagrams to fit standard portrait margins.
  * **Landscape Page Mode**: Splits wide diagrams onto dedicated landscape pages.

### 4.6. Task Lists & Segmented Ordered Lists
* **GFM Task Lists**: Uses `@tiptap/extension-task-list` and `@tiptap/extension-task-item`. Checkbox styling must target `ul[data-type="taskList"] > li, li[data-checked]` with `display: flex; flex-direction: row; align-items: flex-start; gap: 0.625rem;` so text is placed horizontally adjacent to the checkbox without wrapping underneath. Checkbox states must be explicitly synced to the cloned DOM in `handleExportPdf` before serializing for PDF generation.
* **Segmented Ordered Lists**: When an ordered list is split by code blocks or sub-lists, `markdownToHtml` outputs `<ol start="${num}">`. `htmlToMarkdown` preserves the numbering via `idx + startNum`.

### 4.7. Testing Guidelines
* **JSX in Test Files**: Any test file importing React components (e.g. testing React NodeViews with `@testing-library/react`) **MUST** use the `.tsx` file extension. If named `.ts`, esbuild treats `<` as a TypeScript type assertion and fails.
* **Canvas Mocking in JSDOM**: Located in [setup.ts](file:///d:/JSProjects/markdown_editor/tests/setup.ts). Canvas 2D context is mocked using an ES6 `Proxy` so any CanvasRenderingContext2D methods (like `bezierCurveTo`, `createLinearGradient`, `measureText`) succeed without error during unit tests.
* **Single `<main>` Tag**: In [page.tsx](file:///d:/JSProjects/markdown_editor/src/app/page.tsx), the outer container is a `<div>` and the inner document canvas is `<main>`. Having only one `<main>` prevents Playwright strict mode collisions during visual regression tests.

### 4.8. Exported PDF Testing & Diagnostics Methodology
During development and regression testing of exported PDFs, multiple verification layers are employed:
1. **Low-Level PDF Binary & AST Stream Inspection**:
   * Decompress Flate-encoded Skia/PDF streams with Node.js `zlib.inflateSync` to inspect raw PDF operators.
   * Verify standard PDF dictionary objects:
     * `/Catalog` dictionary references.
     * `/Outlines \d+ \d+ R` confirming presence of native hierarchical bookmark outlines.
     * `/MarkInfo << /Marked true >>` confirming tagged PDF accessibility structure.
     * `/Annots` arrays containing `/Subtype /Link` dictionaries with valid `/Dest` targets.
     * `/MediaBox` dimension arrays to verify upright enlargement (`width > 650`) vs uniform portrait (`width < 650`, `height > 800`).
2. **Programmatic Metadata & Named Destination Verification**:
   * **Python `pypdf`**: Extract and verify `reader.outline` (bookmark trees) and `reader.named_destinations` (named anchors).
   * **Mozilla PDF.js Engine**: Execute `pdfjsLib.getDocument()` in headless Node, calling `pdf.getDestinations()` and `page.getAnnotations()` to assert destination coordinates `[pageIndex, { name: 'XYZ' }, left, top, zoom]`.
3. **Chromium PDF Viewer Extension (`chrome-extension://...`) Diagnostics**:
   * Inspect the Shadow DOM of `<pdf-viewer>` in headless Chromium (`--headless=new`).
   * Access internal viewer objects (`viewer.navigator_`, `viewer.paramsParser_`) to test named destination callbacks (`getNamedDestinationCallback_`).
   * **Scroll Boundary Gotcha**: In documents that fit within a single A4 page (`scrollHeight <= clientHeight`), `maxScroll` is 0. Chromium's PDF viewer will not visibly scroll even when an internal anchor is correctly matched and navigated. Adding content or page breaks (`hr`) allows multi-page scroll validation.
4. **Visual Regression Snapshotting**:
   * Render exported PDFs in headless Chromium and capture pixel-accurate screenshots (e.g. `check_no_underline.png`) to inspect visual styling, confirm bookmarks sidebar rendering, and verify zero underline or dash artifacts on headings.
5. **Host OS PDF Reader Validation**:
   * Launch exported PDFs in native desktop viewers (e.g. Microsoft Edge, Acrobat) to verify interactive clickability of TOC links and sidebar outline hierarchy.
6. **Automated E2E Test Suite (`tests/e2e/editor-interactions.spec.ts`)**:
   * `PDF Export Endpoint: returns valid A4 PDF stream with status 200`: POST `/api/export-pdf` route test verifying HTTP 200, `application/pdf`, magic bytes `%PDF-`, and non-empty buffer.
   * `Regression: Full UI PDF Export flow exports rendered Mermaid SVGs and KaTeX formulas`: Verifies UI export button, download event interception, and embedded Mermaid SVG / KaTeX equation rendering.
   * `Configurable PDF export: enlarged upright page by default and toggleable 90-degree rotated portrait mode`: Verifies dynamic page resizing (MediaBox width > 650 pt) and 90-degree rotated portrait layout options.
   * `Table of Contents in-document navigation & PDF internal link preservation`: Verifies in-editor TOC smooth scrolling and exported PDF binary validation (`/Subtype /Link`, `/Annots`, `/Outlines`, `/MarkInfo`).

---

## 5. Development & Testing Commands

All commands should be executed from the project root (`d:/JSProjects/markdown_editor`).

### Install Dependencies
```bash
npm install
```

### Start Development Server
```bash
npm run dev
# Server listens on http://localhost:3000
```

### Build Production Bundle
```bash
npm run build
```

### Start Production Server
```bash
npm start
# Server listens on http://localhost:3000
```

### Run Unit & Integration Tests (Vitest)
```bash
npm run test:unit
```
To run in watch mode:
```bash
npm run test:unit:watch
```

### Run End-to-End & Visual Regression Tests (Playwright)
```bash
npm run test:e2e
```
To run only interaction tests:
```bash
npx playwright test tests/e2e/editor-interactions.spec.ts
```
To update visual regression snapshot baselines:
```bash
npx playwright test tests/e2e/visual-regression.spec.ts --update-snapshots
```

### Capture Visual Audit Screenshots
```bash
node scripts/inspect-ui.mjs
```

### Test CLI (`npm run cli --`)
Drives the real app headlessly for reproducible testing (Playwright is already
a dependency; no new packages). Editor-driven commands need the server
(`npm run dev`); `--server <url>` overrides the default `http://localhost:3000`.
```bash
npm run cli -- --help                        # top help
npm run cli -- export-pdf --help              # per-command flags
npm run cli -- export-pdf --input doc.md --out doc.pdf --mode paginate
npm run cli -- pdf-info --input doc.pdf
npm run cli -- pdf-shot --input doc.pdf --page 7 --out page7.png [--width 1200] [--dpr 3]
npm run cli -- shot --input doc.md --out editor.png [--full-page]
npm run cli -- shot-diagram --input doc.md --out diagram.png [--viewbox x,y,w,h]
```
* `export-pdf` loads the file through the file input, waits for Mermaid/KaTeX
  to render, picks the layout radio (`enlarge|landscape|rotate|fit|paginate`)
  and saves the real download, then prints `pdf-info` for it.
* `pdf-info` is pure-JS binary parsing (pages, MediaBox sizes, `/Outlines`,
  `/MarkInfo`); units: `scripts/cli-pdf.mjs`, tests: `tests/unit/cli-pdf.test.ts`.
* `pdf-shot` serves the PDF over local HTTP and screenshots `#page=N` in the
  built-in viewer. Headless Chromium disables that viewer, so this command
  opens an off-screen headful window and **needs a display**.
* `pdf-render` converts one PDF page straight to PNG with Mozilla pdf.js
  (vendored `pdfjs-dist`, fully headless): `--scale 3` renders an A4 page at
  ~1785x2525 px with no viewer chrome. Use it for maximum quality.
* Argv parsing lives in `scripts/cli-parse.mjs` (`tests/unit/cli-parse.test.ts`).

---

## 6. How to Extend This Application

### Adding a New Custom Block Type (e.g., Math equations, PlantUML)
1. **Define Node & NodeView**:
   Create `src/components/editor/extensions/MyCustomNode.tsx` using `Node.create()` and `ReactNodeViewRenderer`.
2. **Handle Serialization in AST**:
   Update `markdownToHtml` and `htmlToMarkdown` in `src/components/editor/utils/markdown-serializer.ts` to recognize ```` ```mylang ```` and encode attributes with `encodeURIComponent`.
3. **Register Extension**:
   Add the extension to `TableExtensions` / `Editor.tsx` extensions list.
4. **Add Toolbar Insertion Button**:
   Add an action button with a Lucide icon in `Toolbar.tsx`.
5. **Add Tests**:
   - Unit test roundtripping in `tests/unit/markdown-serializer.test.ts`.
   - Interaction test in `tests/e2e/editor-interactions.spec.ts`.
