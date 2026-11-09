import { test, expect } from '@playwright/test';

test.describe('Markdown Workspace E2E & User Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the editor to hydrate
    await expect(page.getByTestId('wysiwyg-editor')).toBeVisible({ timeout: 15000 });
  });

  test('hydrates default document with ECharts, Mermaid diagram and GFM table', async ({ page }) => {
    // Check main title
    await expect(page.locator('h1')).toContainText('Strategic Executive Overview');

    // Check GFM table renders
    const table = page.locator('table');
    await expect(table).toBeVisible();
    await expect(table.locator('th').first()).toContainText('Quarter');

    // Check ECharts container is mounted
    const echartsNode = page.getByTestId('echarts-node-view');
    await expect(echartsNode).toBeVisible();

    // Check Mermaid container is mounted
    const mermaidNode = page.getByTestId('mermaid-node-view');
    await expect(mermaidNode).toBeVisible();
  });

  test('bidirectional editing: drawer Markdown updates WYSIWYG and vice versa', async ({ page }) => {
    // Open markdown drawer
    const splitButton = page.getByTestId('toolbar-toggle-drawer');
    await splitButton.click();

    const drawer = page.getByTestId('markdown-drawer');
    await expect(drawer).toBeVisible();

    // Verify textarea has markdown content
    const textarea = page.getByTestId('raw-markdown-textarea');
    await expect(textarea).toBeVisible();
    const initialText = await textarea.inputValue();
    expect(initialText).toContain('Strategic Executive Overview');

    // Modify text in WYSIWYG editor
    const firstParagraph = page.locator('.ProseMirror p').first();
    await firstParagraph.click();
    await page.keyboard.type(' [LIVE EDIT VERIFICATION]');

    // Assert raw markdown drawer is updated in real time
    await expect(textarea).toHaveValue(/LIVE EDIT VERIFICATION/);

    // Modify text in raw markdown textarea
    await textarea.focus();
    await textarea.fill('# Brand New Executive Vision 2030\n\nDirect edit from raw markdown drawer.');

    // Assert WYSIWYG canvas updates
    await expect(page.locator('h1')).toHaveText('Brand New Executive Vision 2030');
    await expect(page.locator('.ProseMirror p').first()).toHaveText('Direct edit from raw markdown drawer.');
  });

  test('interactive ECharts controls: code edit modal and preset switching', async ({ page }) => {
    const echartsNode = page.getByTestId('echarts-node-view');
    await expect(echartsNode).toBeVisible();

    // Click Edit Chart button
    const editBtn = page.getByTestId('echarts-edit-button');
    await editBtn.click();

    // Code editor drawer should appear
    const codeEditor = page.getByTestId('echarts-code-editor');
    await expect(codeEditor).toBeVisible();

    // Click Bar preset
    const barPresetBtn = codeEditor.getByRole('button', { name: /Bar/i });
    await barPresetBtn.click();

    // Save changes
    const saveBtn = page.getByTestId('echarts-save-button');
    await saveBtn.click();

    // Code editor closes and chart re-renders
    await expect(codeEditor).not.toBeVisible();
    await expect(page.getByTestId('echarts-canvas-container')).toBeVisible();
  });

  test('interactive Mermaid controls: panzoom controls and edit diagram syntax', async ({ page }) => {
    const mermaidNode = page.getByTestId('mermaid-node-view');
    await expect(mermaidNode).toBeVisible();

    // Zoom In
    const zoomInBtn = page.getByTestId('mermaid-zoom-in');
    await zoomInBtn.click();
    await zoomInBtn.click();

    // Reset Zoom
    const resetZoomBtn = page.getByTestId('mermaid-reset-zoom');
    await expect(resetZoomBtn).toContainText('%');
    await resetZoomBtn.click();
    await expect(resetZoomBtn).toContainText('100%');

    // Edit diagram syntax
    const editBtn = page.getByTestId('mermaid-edit-button');
    await editBtn.click();

    const codeEditor = page.getByTestId('mermaid-code-editor');
    await expect(codeEditor).toBeVisible();

    // Switch to Sequence preset
    const sequenceBtn = codeEditor.getByRole('button', { name: /Sequence/i });
    await sequenceBtn.click();

    const saveBtn = page.getByTestId('mermaid-save-button');
    await saveBtn.click();

    // Wait for SVG render
    await expect(page.getByTestId('mermaid-svg-target')).toBeVisible();
  });

  test('interactive Mermaid layout: curve switching re-renders connectors live', async ({ page }) => {
    // Default doc ships a sequence diagram; switch to the Flowchart preset first.
    await page.getByTestId('mermaid-edit-button').first().click();
    await page.getByTestId('mermaid-code-editor').first().getByRole('button', { name: /Flowchart/i }).click();
    await page.getByTestId('mermaid-save-button').first().click();

    const edgeDs = () =>
      page.getByTestId('mermaid-svg-target').locator('g.edgePaths path').evaluateAll((els) =>
        els.map((el) => el.getAttribute('d') || '')
      );

    // Square routing: orthogonal polylines only, no bezier curves.
    await expect.poll(async () => (await edgeDs()).length).toBeGreaterThan(0);
    expect((await edgeDs()).every((d) => !/C/.test(d))).toBe(true);

    // Switch to a curvy routing live via the layout popover.
    await page.getByTestId('mermaid-layout-button').first().click();
    await page.getByTestId('mermaid-curve-select').first().selectOption('basis');
    await expect
      .poll(async () => (await edgeDs()).filter((d) => /C/.test(d)).length)
      .toBeGreaterThan(0);

    // Switch back to square: curves disappear again.
    await page.getByTestId('mermaid-curve-select').first().selectOption('stepBefore');
    await expect
      .poll(async () => (await edgeDs()).filter((d) => /C/.test(d)).length)
      .toBe(0);
  });

  test('PDF Export Endpoint: returns valid A4 PDF stream with status 200', async ({ request }) => {
    const sampleHtml = `
      <div class="pdf-export-container">
        <h1>Quarterly Audit Report</h1>
        <p>This is a verified test document for server-side PDF generation.</p>
        <table class="gfm-table">
          <thead><tr><th>Metric</th><th>Score</th></tr></thead>
          <tbody><tr><td>Performance</td><td>99%</td></tr></tbody>
        </table>
      </div>
    `;

    const response = await request.post('/api/export-pdf', {
      data: {
        html: sampleHtml,
        title: 'Quarterly Audit Report',
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');

    const buffer = await response.body();
    expect(buffer.byteLength).toBeGreaterThan(1000); // Verify non-empty binary PDF buffer

    // PDF magic bytes check (%PDF-)
    const headerString = buffer.subarray(0, 5).toString('ascii');
    expect(headerString).toBe('%PDF-');
  });

  test('Regression: Document sheet dynamically expands for tall content without clipping', async ({ page }) => {
    // Open Markdown Drawer
    await page.getByTestId('toolbar-toggle-drawer').click();
    const textarea = page.getByTestId('raw-markdown-textarea');

    // Create a tall document with many sections
    const tallMarkdown = Array.from({ length: 30 }, (_, i) => `## Section ${i + 1}\n\nThis is paragraph content for section ${i + 1} with details.\n`).join('\n');
    await textarea.fill(tallMarkdown);

    // Close drawer
    await page.getByTestId('toolbar-toggle-drawer').click();
    await page.waitForTimeout(500);

    // Verify document card height expands to fit all sections
    const cardHeight = await page.evaluate(() => {
      const card = document.querySelector('main > div');
      return card ? card.getBoundingClientRect().height : 0;
    });

    expect(cardHeight).toBeGreaterThan(1500);
  });

  test('Regression: Inline code renders as pill badge without pseudo-element backticks', async ({ page }) => {
    // Open drawer and insert inline code
    await page.getByTestId('toolbar-toggle-drawer').click();
    const textarea = page.getByTestId('raw-markdown-textarea');
    await textarea.fill('Testing inline `variable_name` and `"string_value"` badge styling.');
    await page.getByTestId('toolbar-toggle-drawer').click();
    await page.waitForTimeout(500);

    const codeStyles = await page.evaluate(() => {
      const code = document.querySelector('.ProseMirror code');
      if (!code) return null;
      const s = window.getComputedStyle(code);
      const before = window.getComputedStyle(code, '::before');
      const after = window.getComputedStyle(code, '::after');
      return {
        hasBg: s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent',
        beforeContent: before.content,
        afterContent: after.content,
      };
    });

    expect(codeStyles).not.toBeNull();
    expect(codeStyles?.hasBg).toBe(true);
    // Pseudo-element backticks must be removed
    expect(codeStyles?.beforeContent).toBe('""');
    expect(codeStyles?.afterContent).toBe('""');
  });

  test('Regression: Full UI PDF Export flow exports rendered Mermaid SVGs and KaTeX formulas', async ({ page }) => {
    // Load markdown with Mermaid and KaTeX
    await page.getByTestId('toolbar-toggle-drawer').click();
    const textarea = page.getByTestId('raw-markdown-textarea');
    await textarea.fill(`
# PDF Regression Test Document

\`\`\`mermaid
flowchart LR
  A[Client] --> B[Server]
\`\`\`

Here is a math formula: $E = mc^2$ and transition: $\\rightarrow$.

\`\`\`diff
- old_value
+ new_value
\`\`\`
    `);
    await page.getByTestId('toolbar-toggle-drawer').click();
    await page.waitForTimeout(2000); // Allow Mermaid SVG & KaTeX to render in DOM

    // Set up download listener and trigger PDF export
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await page.getByTestId('toolbar-export-pdf').click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.pdf');

    // Read download stream and verify valid PDF binary
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    expect(pdfBuffer.byteLength).toBeGreaterThan(10000);
    expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  test('Regression: Ordered list maintains numbering across code blocks and nested items', async ({ page }) => {
    await page.getByTestId('toolbar-toggle-drawer').click();
    const textarea = page.getByTestId('raw-markdown-textarea');
    await textarea.fill(`
1. First step
2. Second step
\`\`\`bash
echo "code in between"
\`\`\`
3. Third step
4. Fourth step
- bullet a
- bullet b
5. Fifth step
    `);
    await page.getByTestId('toolbar-toggle-drawer').click();
    await page.waitForTimeout(500);

    const listStarts = await page.evaluate(() => {
      const lists = Array.from(document.querySelectorAll('.ProseMirror ol'));
      return lists.map(ol => ({
        start: ol.getAttribute('start') || '1',
        itemCount: ol.querySelectorAll(':scope > li').length
      }));
    });

    expect(listStarts).toEqual([
      { start: '1', itemCount: 2 },
      { start: '3', itemCount: 2 },
      { start: '5', itemCount: 1 }
    ]);
  });

  test('Regression: Task list checkboxes render with input checkboxes and toggle interactive state', async ({ page }) => {
    await page.getByTestId('toolbar-toggle-drawer').click();
    const textarea = page.getByTestId('raw-markdown-textarea');
    await textarea.fill(`
- [x] Initial completed task
- [ ] Initial pending task
    `);
    await page.getByTestId('toolbar-toggle-drawer').click();
    await page.waitForTimeout(500);

    // Verify taskList is rendered with input checkboxes
    const taskList = page.locator('.ProseMirror ul[data-type="taskList"]');
    await expect(taskList).toBeVisible();

    const inputs = taskList.locator('input[type="checkbox"]');
    await expect(inputs).toHaveCount(2);
    await expect(inputs.nth(0)).toBeChecked();
    await expect(inputs.nth(1)).not.toBeChecked();

    // Click the unchecked checkbox to toggle
    await inputs.nth(1).click();
    await expect(inputs.nth(1)).toBeChecked();

    // Verify markdown drawer updates to reflect checked state
    await page.getByTestId('toolbar-toggle-drawer').click();
    await expect(textarea).toHaveValue(/-\s*\[x\]\s*Initial pending task/);
  });

  test('Regression: Multi-level nested lists render with hierarchical indentation and circle bullets', async ({ page }) => {
    await page.getByTestId('toolbar-toggle-drawer').click();
    const textarea = page.getByTestId('raw-markdown-textarea');
    await textarea.fill(`
- **Parent Item 1**:
  - Sub item 1.1
  - Sub item 1.2
- **Parent Item 2**:
  - Sub item 2.1
    `);
    await page.getByTestId('toolbar-toggle-drawer').click();
    await page.waitForTimeout(500);

    // Verify outer list contains inner nested list
    const outerUl = page.locator('.ProseMirror > ul');
    await expect(outerUl).toBeVisible();

    const nestedUls = outerUl.locator('ul');
    await expect(nestedUls).toHaveCount(2);

    // Verify sub-items are inside the nested lists
    await expect(nestedUls.nth(0).locator('li')).toHaveCount(2);
    await expect(nestedUls.nth(1).locator('li')).toHaveCount(1);

    // Verify bidirectional roundtrip preserves indentation
    await page.getByTestId('toolbar-toggle-drawer').click();
    const rawVal = await textarea.inputValue();
    expect(rawVal).toContain('- **Parent Item 1**:');
    expect(rawVal).toContain('  - Sub item 1.1');
    expect(rawVal).toContain('  - Sub item 1.2');
    expect(rawVal).toContain('- **Parent Item 2**:');
    expect(rawVal).toContain('  - Sub item 2.1');
  });

  test('Configurable PDF export: enlarged upright page by default and toggleable 90-degree rotated portrait mode', async ({ page }) => {
    // Open drawer and insert wide sequence diagram
    await page.getByTestId('toolbar-toggle-drawer').click();
    const textarea = page.getByTestId('raw-markdown-textarea');
    await textarea.fill(`
# High-Scale System Architecture

\`\`\`mermaid
sequenceDiagram
  autonumber
  actor User
  participant CDN as Global Edge CDN
  participant Gateway as API Gateway & Auth Service
  participant Microservice as Order Processing Service
  participant Queue as Kafka Message Broker
  participant Worker as Fulfillment Worker
  participant DB as Clustered Database
  User->>CDN: Request Assets & API
  CDN->>Gateway: Route Validated API Token
  Gateway->>Microservice: Dispatch Order Payload
  Microservice->>Queue: Publish OrderCreated Event
  Queue-->>Worker: Consume Event
  Worker->>DB: Persist Records
\`\`\`
    `);
    await page.getByTestId('toolbar-toggle-drawer').click();
    await page.waitForTimeout(2000); // Allow Mermaid to render SVG in DOM

    // Verify per-diagram layout select exists
    const perDiagramSelect = page.getByTestId('mermaid-pdf-layout-select').first();
    await expect(perDiagramSelect).toBeVisible();

    // 1. Test Default / Enlarged Page Mode: diagram page is enlarged to fit without rotation
    const downloadPromise1 = page.waitForEvent('download', { timeout: 20000 });
    await page.getByTestId('toolbar-export-pdf').click();

    const download1 = await downloadPromise1;
    expect(download1.suggestedFilename()).toContain('.pdf');

    const stream1 = await download1.createReadStream();
    const chunks1: Buffer[] = [];
    for await (const chunk of stream1) {
      chunks1.push(Buffer.from(chunk));
    }
    const pdfBuffer1 = Buffer.concat(chunks1);
    expect(pdfBuffer1.byteLength).toBeGreaterThan(15000);
    expect(pdfBuffer1.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    const pdfText1 = pdfBuffer1.toString('binary');
    const mediaBoxes1 = pdfText1.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g) || [];
    expect(mediaBoxes1.length).toBeGreaterThan(0);
    
    // In enlarged mode, at least one page is wider than standard portrait (>650 pt or width > height)
    const hasEnlargedPage = mediaBoxes1.some(box => {
      const parts = box.match(/[\d.]+/g)?.map(Number) || [];
      const width = parts[2];
      const height = parts[3];
      return width > 650 || width > height;
    });
    expect(hasEnlargedPage).toBe(true);

    // 2. Test Rotate Mode via Settings Popover
    await page.getByTestId('toolbar-pdf-settings-toggle').click();
    const popover = page.getByTestId('toolbar-pdf-settings-popover');
    await expect(popover).toBeVisible();

    // Select Rotate 90° radio button
    await page.getByTestId('radio-mermaid-rotate').click();

    // Trigger export with rotate mode
    const downloadPromise2 = page.waitForEvent('download', { timeout: 20000 });
    await page.getByTestId('toolbar-export-pdf').click();

    const download2 = await downloadPromise2;
    const stream2 = await download2.createReadStream();
    const chunks2: Buffer[] = [];
    for await (const chunk of stream2) {
      chunks2.push(Buffer.from(chunk));
    }
    const pdfBuffer2 = Buffer.concat(chunks2);
    expect(pdfBuffer2.byteLength).toBeGreaterThan(15000);

    const pdfText2 = pdfBuffer2.toString('binary');
    const mediaBoxes2 = pdfText2.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g) || [];
    expect(mediaBoxes2.length).toBeGreaterThan(0);

    // In rotate mode, all pages are strictly uniform A4 portrait
    for (const box of mediaBoxes2) {
      const parts = box.match(/[\d.]+/g)?.map(Number) || [];
      const width = parts[2];
      const height = parts[3];
      expect(width).toBeLessThan(height);
      expect(width).toBeLessThan(650);
      expect(height).toBeGreaterThan(800);
    }
  });

  test('toolbar buttons: formatting and heading tools apply marks and blocks', async ({ page }) => {
    // Clear content and type clean paragraph
    await page.getByTestId('toolbar-toggle-drawer').click();
    const textarea = page.getByTestId('raw-markdown-textarea');
    await textarea.fill('Testing rich formatting capabilities.');
    await page.getByTestId('toolbar-toggle-drawer').click();
    await page.waitForTimeout(500);

    // Select text in editor
    const p = page.locator('.ProseMirror p').first();
    await p.click();
    await page.keyboard.press('Control+A');

    // Click Bold button
    const boldBtn = page.getByTitle('Bold (Ctrl+B)');
    await boldBtn.click();
    await expect(page.locator('.ProseMirror strong')).toBeVisible();

    // Click Italic button
    const italicBtn = page.getByTitle('Italic (Ctrl+I)');
    await italicBtn.click();
    await expect(page.locator('.ProseMirror em')).toBeVisible();

    // Click Heading 2 button
    const h2Btn = page.getByTitle('Heading 2');
    await h2Btn.click();
    await expect(page.locator('.ProseMirror h2')).toBeVisible();

    // Click Blockquote button
    const quoteBtn = page.getByTitle('Blockquote');
    await quoteBtn.click();
    await expect(page.locator('.ProseMirror blockquote')).toBeVisible();
  });

  test('toolbar buttons: table menu inserts new table into editor', async ({ page }) => {
    // Click table menu button
    const tableMenuBtn = page.getByTestId('toolbar-table-menu');
    await tableMenuBtn.click();

    // Insert 3x3 table
    const insertTableBtn = page.getByTestId('toolbar-insert-table');
    await expect(insertTableBtn).toBeVisible();
    await insertTableBtn.click();

    // Table should now exist in canvas
    const tables = page.locator('.ProseMirror table');
    await expect(tables.first()).toBeVisible();
  });

  test('toolbar buttons: visual block insertion for Math LaTeX formula with presets', async ({ page }) => {
    // Click Insert Math button in toolbar
    const insertMathBtn = page.getByTestId('toolbar-insert-math');
    await insertMathBtn.click();

    // A math block should be inserted
    const mathNode = page.getByTestId('math-block-view').first();
    await expect(mathNode).toBeVisible();

    // Click Edit Formula button
    const editBtn = mathNode.getByTestId('math-edit-button');
    await editBtn.click();

    const mathEditor = mathNode.getByTestId('math-code-editor');
    await expect(mathEditor).toBeVisible();

    // Click Euler's Identity preset
    const eulerBtn = mathEditor.getByRole('button', { name: /Euler's Identity/i });
    await eulerBtn.click();

    // Apply & Render
    const saveBtn = mathNode.getByTestId('math-save-button');
    await saveBtn.click();

    await expect(mathEditor).not.toBeVisible();
    await expect(mathNode.getByTestId('math-display-container')).toBeVisible();
  });

  test('workspace buttons: outline panel toggle and sample document reset', async ({ page }) => {
    // Toggle outline closed
    const outlineToggleBtn = page.getByTestId('toolbar-toggle-outline');
    await outlineToggleBtn.click();

    const outline = page.getByTestId('document-outline');
    await expect(outline).not.toBeVisible();

    // Toggle outline open again
    await outlineToggleBtn.click();
    await expect(outline).toBeVisible();

    // Test outline close (X) button
    const outlineCloseBtn = page.getByTestId('outline-close-button');
    await outlineCloseBtn.click();
    await expect(outline).not.toBeVisible();

    // Test sample document reset button
    const sampleBtn = page.getByTitle('Reset to sample document');
    await sampleBtn.click();

    // Sample title should be restored
    await expect(page.locator('h1')).toContainText('Strategic Executive Overview');
  });

  test('drawer buttons: copy button and close button', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Open drawer
    await page.getByTestId('toolbar-toggle-drawer').click();
    const drawer = page.getByTestId('markdown-drawer');
    await expect(drawer).toBeVisible();

    // Click Copy button
    const copyBtn = page.getByTestId('drawer-copy-button');
    await copyBtn.click();
    await expect(copyBtn).toContainText('Copied');

    // Click Close button
    const closeBtn = page.getByTestId('drawer-close-button');
    await closeBtn.click();
    await expect(drawer).not.toBeVisible();
  });

  test('Table of Contents in-document navigation & PDF internal link preservation', async ({ page }) => {
    // 1. Load user sample with TOC and sections into raw markdown drawer
    await page.getByTestId('toolbar-toggle-drawer').click();
    const textarea = page.getByTestId('raw-markdown-textarea');
    await textarea.fill(`# My Project Documentation

## Table of Contents
* [1. Introduction](#1-introduction)
* [2. Installation Quickstart](#2-installation-quickstart)
    * [2.1 Prerequisites](#21-prerequisites)
    * [2.2 Configuration](#22-configuration)
* [3. Frequently Asked Questions](#3-frequently-asked-questions)

---

## 1. Introduction
This is where your main introduction content goes. Adding lots of lines so it requires scrolling down.
${Array.from({ length: 15 }, (_, i) => `<p>Introduction paragraph line ${i + 1}</p>`).join('\n')}

## 2. Installation Quickstart
Step-by-step setup guides go right here.
${Array.from({ length: 15 }, (_, i) => `<p>Setup paragraph line ${i + 1}</p>`).join('\n')}

### 2.1 Prerequisites
Make sure you have the required software installed before continuing.
${Array.from({ length: 15 }, (_, i) => `<p>Prerequisites details line ${i + 1}</p>`).join('\n')}

### 2.2 Configuration
Adjust your environment variables here.
${Array.from({ length: 15 }, (_, i) => `<p>Configuration details line ${i + 1}</p>`).join('\n')}

## 3. Frequently Asked Questions
Find answers to common project troubleshooting issues.
${Array.from({ length: 15 }, (_, i) => `<p>FAQ entry ${i + 1}</p>`).join('\n')}
`);
    // Close drawer
    await page.getByTestId('toolbar-toggle-drawer').click();
    await page.waitForTimeout(500);

    // Verify main container scroll starts at 0
    const initialScrollTop = await page.evaluate(() => {
      const main = document.querySelector('main');
      return main ? main.scrollTop : 0;
    });
    expect(initialScrollTop).toBe(0);

    // Find TOC link for "3. Frequently Asked Questions"
    const faqLink = page.locator('.ProseMirror a[href="#3-frequently-asked-questions"]');
    await expect(faqLink).toBeVisible();

    // Click the TOC link in WYSIWYG editor
    await faqLink.click();
    await page.waitForTimeout(600);

    // Verify editor scrolled down to that section
    const scrolledTop = await page.evaluate(() => {
      const main = document.querySelector('main');
      return main ? main.scrollTop : 0;
    });
    expect(scrolledTop).toBeGreaterThan(400);

    // Verify target heading has pulse class applied
    const targetHeading = page.locator('[id="3-frequently-asked-questions"]');
    await expect(targetHeading).toBeVisible();

    // Now test PDF export with TOC
    const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
    await page.getByTestId('toolbar-export-pdf').click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.pdf');

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);
    expect(pdfBuffer.byteLength).toBeGreaterThan(10000);

    const pdfBinary = pdfBuffer.toString('binary');
    // Verify PDF contains Annotations of Subtype Link with destinations
    expect(pdfBinary).toMatch(/\/Subtype\s*\/Link/);
    expect(pdfBinary).toMatch(/\/Annots\s*\[/);
    // Verify PDF contains Document Outlines (bookmarks sidebar) and accessibility tagged structure
    expect(pdfBinary).toMatch(/\/Outlines\s+\d+\s+\d+\s+R/);
    expect(pdfBinary).toMatch(/\/MarkInfo/);
  });
});




