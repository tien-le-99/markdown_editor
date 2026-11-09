#!/usr/bin/env node
/**
 * markdown_editor test CLI — reproducible testing through the real app.
 *   npm run cli -- <command> [options]
 * See --help. Requires the dev/prod server for editor-driven commands.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { parseArgs, topHelp, commandHelp } from './cli-parse.mjs';
import { pdfInfo, formatPdfInfo } from './cli-pdf.mjs';

const DEFAULT_SERVER = 'http://localhost:3000';

class CliError extends Error {}

const num = (v, fallback) => {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new CliError(`Want a positive number, got "${v}".`);
  return n;
};

function resolveOut(out) {
  const abs = path.resolve(out);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  return abs;
}

async function checkServer(server) {
  let res;
  try {
    res = await fetch(server, { signal: AbortSignal.timeout(10000) });
  } catch {
    throw new CliError(
      `Server not reachable at ${server}.\nStart it first:  npm run dev   (then retry)`
    );
  }
  if (!res.ok) throw new CliError(`Server at ${server} answered HTTP ${res.status}.`);
}

/** Load a markdown file into the editor and wait until it settles. */
async function loadMarkdown(page, inputAbs, settleMs) {
  if (!fs.existsSync(inputAbs)) throw new CliError(`Input file not found: ${inputAbs}`);
  const server = page._cliServer;
  await page.goto(server, { waitUntil: 'networkidle', timeout: 60000 });
  await page.getByTestId('toolbar-file-input').setInputFiles(inputAbs);
  await page.locator('.ProseMirror').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(settleMs);
  const mermaidCount = await page.getByTestId('mermaid-node-view').count();
  if (mermaidCount > 0) {
    await page
      .getByTestId('mermaid-svg-target')
      .first()
      .locator('svg')
      .waitFor({ timeout: 120000 });
    await page.waitForTimeout(settleMs);
  }
}

async function newEditorPage(server, viewport) {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport })).newPage();
  page._cliServer = server;
  return { browser, page };
}

/** Apply per-diagram layout flags to the first Mermaid node (live UI). */
async function applyDiagramLayout(page, flags) {
  const jobs = [];
  if (flags.curve !== undefined) jobs.push(['select', 'mermaid-curve-select', flags.curve]);
  for (const [flag, testid] of [
    ['nodeSpacing', 'mermaid-spacing-node'],
    ['rankSpacing', 'mermaid-spacing-rank'],
    ['padding', 'mermaid-spacing-padding'],
    ['lineGap', 'mermaid-spacing-line'],
    ['boxGap', 'mermaid-spacing-box'],
  ]) {
    if (flags[flag] !== undefined) jobs.push(['fill', testid, String(flags[flag])]);
  }
  if (jobs.length === 0) return false;
  await page.getByTestId('mermaid-layout-button').first().click();
  for (const [kind, testid, value] of jobs) {
    const el = page.getByTestId(testid).first();
    if (kind === 'select') await el.selectOption(value);
    else await el.fill(value);
    await page.waitForTimeout(400);
  }
  // Let the live re-render commit (render queue + React state).
  await page
    .getByTestId('mermaid-svg-target')
    .first()
    .locator('svg')
    .waitFor({ timeout: 120000 });
  await page.waitForTimeout(2500);
  // Shut the popover so later captures stay clean.
  await page.getByTestId('mermaid-layout-button').first().click();
  return true;
}

async function cmdExportPdf(flags) {
  const server = flags.server || DEFAULT_SERVER;
  const inputAbs = path.resolve(flags.input);
  const outAbs = resolveOut(flags.out);
  const settleMs = num(flags.settle, 5000);
  const timeoutMs = num(flags.timeout, 180000);
  await checkServer(server);

  const { browser, page } = await newEditorPage(server, { width: 1400, height: 900 });
  try {
    console.log(`loading ${inputAbs}`);
    await loadMarkdown(page, inputAbs, settleMs);
    await applyDiagramLayout(page, flags);

    if (flags.mode) {
      console.log(`pdf layout mode: ${flags.mode}`);
      await page.getByTestId('toolbar-pdf-settings-toggle').click();
      await page.getByTestId(`radio-mermaid-${flags.mode}`).check();
      const downloadPromise = page.waitForEvent('download', { timeout: timeoutMs });
      await page.getByTestId('toolbar-pdf-settings-popover').getByText('Export Now').click();
      const download = await downloadPromise;
      await download.saveAs(outAbs);
    } else {
      const downloadPromise = page.waitForEvent('download', { timeout: timeoutMs });
      await page.getByTestId('toolbar-export-pdf').click();
      const download = await downloadPromise;
      await download.saveAs(outAbs);
    }
    const info = pdfInfo(fs.readFileSync(outAbs));
    if (!info.headerOk) throw new CliError(`Saved file is not a PDF: ${outAbs}`);
    console.log(`saved ${outAbs}`);
    console.log(formatPdfInfo(info, 'pdf'));
  } finally {
    await browser.close();
  }
}

async function cmdPdfInfo(flags) {
  const inputAbs = path.resolve(flags.input);
  if (!fs.existsSync(inputAbs)) throw new CliError(`Input file not found: ${inputAbs}`);
  console.log(formatPdfInfo(pdfInfo(fs.readFileSync(inputAbs)), inputAbs));
}

async function cmdPdfShot(flags) {
  const inputAbs = path.resolve(flags.input);
  const outAbs = resolveOut(flags.out);
  const pageNo = num(flags.page, 0);
  const width = Math.round(num(flags.width, 1000));
  const dpr = flags.dpr === undefined ? 2 : Number(flags.dpr);
  if (!fs.existsSync(inputAbs)) throw new CliError(`Input file not found: ${inputAbs}`);

  const bytes = fs.readFileSync(inputAbs);
  const info = pdfInfo(bytes);
  if (!info.headerOk) throw new CliError(`Not a PDF file: ${inputAbs}`);
  if (pageNo > info.pages) throw new CliError(`Page ${pageNo} out of range (pdf has ${info.pages} pages).`);

  // Minimal local file server: the viewer needs http(s), file:// triggers download.
  const server = await new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Content-Length': bytes.length,
      });
      res.end(bytes);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const port = server.address().port;
  const height = Math.round((width * 14142) / 10000); // ~A4 ratio room for viewer chrome
  // Headful off-screen: headless Chromium disables the built-in PDF viewer,
  // so this command needs a display (it stays out of the way off-screen).
  const browser = await chromium
    .launch({ headless: false, args: ['--no-sandbox', '--window-position=-2000,-2000'] })
    .catch((e) => {
      throw new CliError(`Could not open a viewer window (pdf-shot needs a display): ${e.message.split('\n')[0]}`);
    });
  try {
    // deviceScaleFactor makes the viewer rasterize vector content at full
    // device pixels: the PNG is a true high-res render, not an upscale.
    const page = await (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr })).newPage();
    let downloaded = null;
    page.on('download', (d) => {
      downloaded = d.suggestedFilename();
    });
    await page.goto(`http://127.0.0.1:${port}/doc.pdf#page=${pageNo}`, {
      waitUntil: 'load',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    if (downloaded) throw new CliError('PDF viewer did not engage (browser downloaded the file instead).');
    await page.screenshot({ path: outAbs });
    console.log(`saved page ${pageNo}/${info.pages} -> ${outAbs}`);
  } finally {
    await browser.close();
    server.close();
  }
}

/**
 * True PDF -> PNG conversion with Mozilla pdf.js (vendored devDependency).
 * Fully headless: renders only the requested page to an off-screen canvas
 * at --scale device pixels per PDF point and returns the exact raster —
 * no viewer, no window chrome, no display needed.
 */
async function cmdPdfRender(flags) {
  const inputAbs = path.resolve(flags.input);
  const outAbs = resolveOut(flags.out);
  const pageNo = num(flags.page, 0);
  const scale = Number(flags.scale ?? 3);
  if (!fs.existsSync(inputAbs)) throw new CliError(`Input file not found: ${inputAbs}`);
  const bytes = fs.readFileSync(inputAbs);
  const info = pdfInfo(bytes);
  if (!info.headerOk) throw new CliError(`Not a PDF file: ${inputAbs}`);
  if (pageNo > info.pages) throw new CliError(`Page ${pageNo} out of range (pdf has ${info.pages} pages).`);

  const pdfjsDir = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build');
  const libSrc = path.join(pdfjsDir, 'pdf.mjs');
  const workerSrc = path.join(pdfjsDir, 'pdf.worker.mjs');
  if (!fs.existsSync(libSrc) || !fs.existsSync(workerSrc)) {
    throw new CliError('pdfjs-dist build not found. Run: npm install');
  }
  const libBytes = fs.readFileSync(libSrc);
  const workerBytes = fs.readFileSync(workerSrc);

  const server = await new Promise((resolve) => {
    // Same-origin shell page: the module import below needs no CORS, which
    // an opaque about:blank origin cannot satisfy for http imports.
    const shell =
      '<!doctype html><html><body><script type="module">' +
      "import * as pdfjsLib from './pdf.mjs';" +
      "pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.mjs';" +
      'window.__pdfjs = pdfjsLib; window.__pdfjsReady = true;</script></body></html>';
    const srv = http.createServer((req, res) => {
      const head = (type, body) => ({
        'Content-Type': type,
        'Content-Length': typeof body === 'string' ? Buffer.byteLength(body) : body.length,
      });
      if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, head('text/html', shell));
        res.end(shell);
      } else if (req.url === '/doc.pdf') {
        res.writeHead(200, head('application/pdf', bytes));
        res.end(bytes);
      } else if (req.url === '/pdf.mjs') {
        res.writeHead(200, head('text/javascript', libBytes));
        res.end(libBytes);
      } else if (req.url === '/pdf.worker.mjs') {
        res.writeHead(200, head('text/javascript', workerBytes));
        res.end(workerBytes);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 30000 });
    page.setDefaultTimeout(120000);
    await page.waitForFunction('window.__pdfjsReady === true', null, { timeout: 60000 });
    const result = await page.evaluate(
      async ({ pageNo, scale }) => {
        const pdfjsLib = window.__pdfjs;
        const data = await fetch('./doc.pdf').then((r) => r.arrayBuffer());
        const doc = await pdfjsLib.getDocument({ data }).promise;
        const pdfPage = await doc.getPage(pageNo);
        const viewport = pdfPage.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const url = canvas.toDataURL('image/png');
        const dims = { w: canvas.width, h: canvas.height };
        if (typeof doc.destroy === 'function') await doc.destroy();
        return { ...dims, url };
      },
      { pageNo, scale }
    );
    fs.writeFileSync(outAbs, Buffer.from(result.url.split(',', 2)[1], 'base64'));
    console.log(`saved page ${pageNo}/${info.pages} ${result.w}x${result.h} -> ${outAbs}`);
  } finally {
    await browser.close();
    server.close();
  }
}

async function cmdShot(flags) {  const server = flags.server || DEFAULT_SERVER;
  const inputAbs = path.resolve(flags.input);
  const outAbs = resolveOut(flags.out);
  const width = Math.round(num(flags.width, 1400));
  await checkServer(server);
  const { browser, page } = await newEditorPage(server, { width, height: 900 });
  try {
    await loadMarkdown(page, inputAbs, num(flags.settle, 5000));
    await applyDiagramLayout(page, flags);
    await page.screenshot({ path: outAbs, fullPage: !!flags.fullPage });
    console.log(`saved ${outAbs}`);
  } finally {
    await browser.close();
  }
}

async function cmdShotDiagram(flags) {
  const server = flags.server || DEFAULT_SERVER;
  const inputAbs = path.resolve(flags.input);
  const outAbs = resolveOut(flags.out);
  const width = Math.round(num(flags.width, 1400));
  await checkServer(server);
  const { browser, page } = await newEditorPage(server, { width, height: 900 });
  try {
    await loadMarkdown(page, inputAbs, num(flags.settle, 5000));
    const count = await page.getByTestId('mermaid-node-view').count();
    if (count === 0) throw new CliError('No Mermaid diagram in this document.');
    await applyDiagramLayout(page, flags);
    await page.evaluate(
      ({ width, viewbox }) => {
        const live = document.querySelector('[data-testid="mermaid-svg-target"] svg');
        if (!live) throw new Error('diagram svg missing');
        const ov = document.createElement('div');
        ov.id = 'cli-shot';
        ov.style.cssText =
          'position:fixed;inset:0;z-index:9999;background:#fff;overflow:auto;display:flex;align-items:flex-start;justify-content:center;';
        document.body.appendChild(ov);
        const clone = live.cloneNode(true);
        clone.removeAttribute('style');
        if (viewbox) clone.setAttribute('viewBox', viewbox);
        clone.style.width = `${width}px`;
        clone.style.height = 'auto';
        clone.style.maxWidth = 'none';
        ov.appendChild(clone);
      },
      { width, viewbox: flags.viewbox || null }
    );
    // Size the viewport to the content so the element shot captures it whole
    // (an overflow-clipped overlay otherwise yields a half-blank capture).
    const size = await page.evaluate(
      ({ viewbox }) => {
        const clone = document.querySelector('#cli-shot svg');
        const vb = clone.viewBox.baseVal;
        const r = clone.getBoundingClientRect();
        if (viewbox && vb.width > 0 && vb.height > 0) {
          return { w: Math.ceil(r.width), h: Math.ceil(r.width * (vb.height / vb.width)) };
        }
        const bb = clone.getBBox();
        const k = r.width / vb.width;
        return { w: Math.ceil(bb.width * k), h: Math.ceil(bb.height * k) };
      },
      { viewbox: flags.viewbox || null }
    );
    await page.setViewportSize({
      width: Math.min(Math.max(size.w + 60, 800), 3000),
      height: Math.min(Math.max(size.h + 60, 600), 8000),
    });
    await page.waitForTimeout(500);
    await page.locator('#cli-shot svg').screenshot({ path: outAbs });
    console.log(`saved ${outAbs}`);
  } finally {
    await browser.close();
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    console.error(`error: ${parsed.error}\n`);
    console.error(parsed.command ? commandHelp(parsed.command) : topHelp());
    process.exit(1);
  }
  if (parsed.flags.help || !parsed.command) {
    console.log(parsed.command ? commandHelp(parsed.command) : topHelp());
    return;
  }
  const run = {
    'export-pdf': cmdExportPdf,
    'pdf-info': cmdPdfInfo,
    'pdf-shot': cmdPdfShot,
    'pdf-render': cmdPdfRender,
    shot: cmdShot,
    'shot-diagram': cmdShotDiagram,
  }[parsed.command];
  try {
    await run(parsed.flags);
  } catch (e) {
    if (e instanceof CliError) {
      console.error(`error: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

main();
