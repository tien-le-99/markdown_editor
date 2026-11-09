import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// Pre-load local KaTeX CSS for vector math printing
let katexCss = '';
try {
  katexCss = fs.readFileSync(path.join(process.cwd(), 'node_modules/katex/dist/katex.min.css'), 'utf-8');
} catch (e) {
  console.warn('Could not load local KaTeX CSS:', e);
}

export async function POST(req: NextRequest) {
  let browser;

  try {
    const body = await req.json();
    const { html, title = 'Document' } = body;

    if (!html || typeof html !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing "html" payload in request body' },
        { status: 400 }
      );
    }

    // Launch headless Chromium via Playwright
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      deviceScaleFactor: 2,
    });

    const page = await context.newPage();

    // Prepare complete print template with isolated print rules and reset transforms
    const printHtml = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <style>
            ${katexCss}

            @page {
              size: A4 portrait;
              margin: 18mm 16mm 18mm 16mm;
            }

            @page mermaid-landscape {
              size: A4 landscape;
              margin: 16mm 18mm 16mm 18mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              color: #0f172a;
              background-color: #ffffff;
              line-height: 1.6;
              font-size: 11pt;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            .pdf-export-container {
              width: 100%;
              max-width: 100%;
              margin: 0 auto;
            }

            h1, h2, h3, h4, h5, h6 {
              page-break-after: avoid !important;
              break-after: avoid !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              color: #0f172a;
              font-weight: 700;
            }

            h1 { font-size: 24pt; margin-bottom: 14pt; }
            h2 { font-size: 18pt; margin-top: 20pt; margin-bottom: 10pt; border-bottom: 1px solid #e2e8f0; padding-bottom: 6pt; }
            h3 { font-size: 14pt; margin-top: 16pt; margin-bottom: 8pt; }

            p { margin: 8pt 0; }

            a[href] {
              color: #0284c7 !important;
              text-decoration: underline !important;
              text-underline-offset: 2pt !important;
            }

            a:not([href]),
            .anchor-point {
              text-decoration: none !important;
              color: inherit !important;
              border: none !important;
              display: inline !important;
              width: 0 !important;
              height: 0 !important;
              font-size: 0 !important;
              line-height: 0 !important;
            }

            hr {
              border: none !important;
              border-top: 1px solid #e2e8f0 !important;
              margin: 16pt 0 !important;
              break-after: page !important;
              page-break-after: always !important;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin: 14pt 0;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }

            tr {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }

            th, td {
              border: 1px solid #cbd5e1;
              padding: 8pt 12pt;
              font-size: 9.5pt;
              text-align: left;
            }

            th {
              background-color: #f1f5f9 !important;
              font-weight: 600;
              color: #1e293b;
            }

            /* Blockquotes may contain headings, tables and fenced code.
               Keep the quoted body upright and use a quote card instead of
               inheriting italics into table cells and code. */
            blockquote {
              border-left: 4px solid #38a9f7;
              background: linear-gradient(135deg, rgba(240, 247, 255, 0.95), rgba(248, 250, 252, 0.98));
              padding: 10pt 14pt;
              border-radius: 0 8pt 8pt 0;
              color: #1e293b;
              margin: 12pt 0;
              font-style: normal;
              page-break-inside: auto;
              break-inside: auto;
            }

            blockquote > :first-child {
              margin-top: 0 !important;
            }

            blockquote > :last-child {
              margin-bottom: 0 !important;
            }

            /* Section dividers inside a quoted message are visual separators,
               not page breaks. */
            blockquote hr {
              break-after: auto !important;
              page-break-after: auto !important;
              margin: 10pt 0 !important;
            }

            /* Long CLI listings inside a quote must be allowed to flow across
               pages; otherwise the whole block jumps to a fresh page and
               leaves a nearly empty page behind it. */
            blockquote pre {
              break-inside: auto !important;
              page-break-inside: auto !important;
            }

            /* A rule that introduces a quoted message is a divider, not a
               page break: keep the lead-in text and the quote together. */
            hr:has(+ blockquote) {
              break-after: auto !important;
              page-break-after: auto !important;
            }

            :not(pre) > code {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              background-color: #f1f5f9 !important;
              color: #0f172a !important;
              padding: 2pt 5pt;
              border-radius: 4px;
              font-size: 9pt;
              border: 1px solid #e2e8f0;
            }

            :not(pre) > code::before,
            :not(pre) > code::after {
              content: "" !important;
            }

            pre {
              background: #0f172a !important;
              color: #f8fafc !important;
              padding: 12pt;
              border-radius: 6px;
              font-size: 9pt;
              line-height: 1.5;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              overflow: hidden;
              white-space: pre-wrap;
              word-break: break-word;
              margin: 12pt 0;
            }

            pre code {
              background: transparent !important;
              color: #f8fafc !important;
              border: none !important;
              padding: 0 !important;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
              font-size: inherit !important;
            }

            .echarts-node-container,
            .mermaid-node-container,
            .math-block-container {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin: 16pt 0;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              background: #ffffff;
              overflow: hidden;
            }

            /* Dedicated portrait page for wide diagrams rotated 90 degrees */
            .mermaid-rotated-page {
              break-before: page !important;
              break-after: page !important;
              page-break-before: always !important;
              page-break-after: always !important;
              width: 100% !important;
              height: 260mm !important;
              max-height: 260mm !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              position: relative !important;
              overflow: visible !important;
              margin: 0 !important;
              padding: 0 !important;
              border: none !important;
              background: transparent !important;
            }

            .mermaid-rotated-page .mermaid-canvas-viewport {
              width: 100% !important;
              height: 100% !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              position: relative !important;
              overflow: visible !important;
              padding: 0 !important;
              background: transparent !important;
            }

            .mermaid-rotated-inner {
              width: 260mm !important;
              height: 178mm !important;
              max-width: 260mm !important;
              max-height: 178mm !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              transform: rotate(90deg) !important;
              transform-origin: center center !important;
              position: absolute !important;
            }

            .mermaid-rotated-inner .panzoom-wrapper {
              width: 100% !important;
              height: 100% !important;
              max-width: 100% !important;
              max-height: 100% !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              transform: none !important;
            }

            .mermaid-rotated-page .mermaid-rotated-inner svg,
            .mermaid-rotated-inner svg {
              width: 100% !important;
              height: 100% !important;
              max-width: 100% !important;
              max-height: 100% !important;
              display: block !important;
              margin: auto !important;
              transform: none !important;
              object-fit: contain !important;
            }

            /* Dedicated landscape page for wide diagrams (unrotated) */
            .mermaid-landscape-page {
              page: mermaid-landscape;
              break-before: page !important;
              break-after: page !important;
              page-break-before: always !important;
              page-break-after: always !important;
              width: 100% !important;
              height: 178mm !important;
              max-height: 178mm !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              position: relative !important;
              overflow: visible !important;
              margin: 0 !important;
              padding: 0 !important;
              border: none !important;
              background: transparent !important;
            }

            /* Dedicated enlarged page for wide diagrams (unrotated, dynamic page dimensions) */
            .mermaid-enlarge-page {
              break-before: page !important;
              break-after: page !important;
              page-break-before: always !important;
              page-break-after: always !important;
              width: 100% !important;
              height: 100% !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              position: relative !important;
              overflow: visible !important;
              margin: 0 !important;
              padding: 0 !important;
              border: none !important;
              background: transparent !important;
            }

            .mermaid-landscape-page .mermaid-canvas-viewport,
            .mermaid-enlarge-page .mermaid-canvas-viewport {
              width: 100% !important;
              height: 100% !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              position: relative !important;
              overflow: visible !important;
              padding: 0 !important;
              background: transparent !important;
            }

            .mermaid-landscape-page svg,
            .mermaid-enlarge-page svg {
              width: 100% !important;
              height: auto !important;
              max-width: 100% !important;
              max-height: 100% !important;
              display: block !important;
              margin: auto !important;
              transform: none !important;
              object-fit: contain !important;
            }

            /* Paginated tall diagrams: one strict-A4 portrait slice per page */
            .mermaid-paginate-page {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
              position: relative !important;
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              border: none !important;
              background: transparent !important;
              overflow: hidden !important;
            }

            .mermaid-slice-viewport {
              width: 100% !important;
              overflow: hidden !important;
              position: relative !important;
              padding: 0 !important;
              margin: 0 !important;
              background: transparent !important;
            }

            .mermaid-slice-inner {
              position: relative !important;
              padding: 0 !important;
              margin: 0 !important;
            }

            .mermaid-slice-viewport svg {
              display: block !important;
              transform: none !important;
              margin: 0 !important;
            }

            .mermaid-node-container {
              padding: 10pt;
              text-align: center;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
            }

            /* Unclamp interactive canvas height & overflow for full vertical expansion */
            .mermaid-node-container > div:not([class*="border-b"]),
            .mermaid-canvas-viewport {
              height: auto !important;
              min-height: 0 !important;
              max-height: none !important;
              overflow: visible !important;
              background: transparent !important;
              padding: 0 !important;
              width: 100% !important;
            }

            .mermaid-node-container svg text,
            .mermaid-node-container svg span,
            .mermaid-node-container svg p {
              font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
            }

            .math-block-container {
              padding: 16pt;
              text-align: center;
              display: flex;
              justify-content: center;
              align-items: center;
            }

            .katex-display {
              margin: 0 !important;
            }

            .math-inline {
              display: inline-flex;
              align-items: baseline;
            }

            /* Normalize any Panzoom transform or SVG scales for print */
            .panzoom-wrapper:not(.mermaid-rotated-inner .panzoom-wrapper),
            .mermaid-node-container:not(.mermaid-rotated-page) svg,
            svg:not(.mermaid-rotated-inner svg) {
              transform: none !important;
              max-width: 100% !important;
              height: auto !important;
              display: block !important;
              margin: 0 auto !important;
            }

            /* Nested list hierarchy in PDF */
            ul ul {
              list-style-type: circle !important;
              margin-top: 2pt !important;
              margin-bottom: 2pt !important;
            }

            ul ul ul {
              list-style-type: square !important;
            }

            ol ol {
              list-style-type: lower-alpha !important;
              margin-top: 2pt !important;
              margin-bottom: 2pt !important;
            }

            ol ul {
              list-style-type: circle !important;
              margin-top: 2pt !important;
              margin-bottom: 2pt !important;
            }

            /* Task list styling in PDF */
            ul[data-type="taskList"],
            ul.task-list {
              list-style: none !important;
              padding-left: 0 !important;
            }

            ul[data-type="taskList"] > li,
            li[data-type="taskItem"],
            li[data-checked] {
              display: flex !important;
              flex-direction: row !important;
              align-items: flex-start !important;
              gap: 6pt !important;
              margin: 3pt 0 !important;
              list-style: none !important;
            }

            ul[data-type="taskList"] > li::before,
            li[data-type="taskItem"]::before,
            li[data-checked]::before {
              display: none !important;
            }

            ul[data-type="taskList"] > li > label,
            li[data-type="taskItem"] > label {
              display: inline-flex !important;
              align-items: center !important;
              flex-shrink: 0 !important;
              margin-top: 1pt !important;
            }

            ul[data-type="taskList"] > li input[type="checkbox"],
            li[data-type="taskItem"] input[type="checkbox"] {
              width: 10pt !important;
              height: 10pt !important;
              accent-color: #2563eb !important;
              margin: 0 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            ul[data-type="taskList"] > li > div,
            li[data-type="taskItem"] > div {
              flex: 1 1 auto !important;
              min-width: 0 !important;
            }

            ul[data-type="taskList"] > li > div > p,
            li[data-type="taskItem"] > div > p {
              margin: 0 !important;
              line-height: 1.4 !important;
            }

            /* Hide buttons, chrome, error alerts or toolbars in print */
            button, .no-print, [data-testid$="-editor"], pre.hidden, pre[class*="hidden"] {
              display: none !important;
            }
          </style>
        </head>
        <body>
          <div class="pdf-export-container">
            ${html}
          </div>
          <script>
            // Post-render normalize script
            document.querySelectorAll('svg').forEach(svg => {
              svg.style.transform = 'none';
            });
            document.querySelectorAll('.panzoom-wrapper').forEach(wrapper => {
              wrapper.style.transform = 'none';
            });
            document.querySelectorAll('.mermaid-node-container').forEach(container => {
              if (container.classList.contains('mermaid-rotated-page') || 
                  container.classList.contains('mermaid-enlarge-page') || 
                  container.classList.contains('mermaid-landscape-page')) return;
              const viewport = container.querySelector('.mermaid-canvas-viewport') || container.querySelector('.panzoom-wrapper')?.parentElement;
              if (viewport) {
                viewport.style.height = 'auto';
                viewport.style.minHeight = '0';
                viewport.style.maxHeight = 'none';
                viewport.style.overflow = 'visible';
                viewport.style.background = 'transparent';
              }
            });
          </script>
        </body>
      </html>
    `;

    await page.setContent(printHtml, { waitUntil: 'networkidle' });

    // Emulate print media
    await page.emulateMedia({ media: 'print' });

    // Generate high-fidelity vector PDF buffer
    // Note: Margins and page sizes are controlled by CSS @page rules with preferCSSPageSize
    const pdfBuffer = await page.pdf({
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
      outline: true,
      tagged: true,
    });

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(title)}.pdf"`,
        'Content-Length': pdfBuffer.byteLength.toString(),
      },
    });
  } catch (error: any) {
    console.error('Playwright PDF Generation Failed:', error);
    return NextResponse.json(
      { error: `PDF generation failed: ${error.message}` },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
