import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/tienl/.gemini/antigravity-ide/brain/868e04e5-c130-4ee3-a977-c7d31b0b90c7';
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, 'screenshots');

async function testPdfExportFlow() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Load DEMO.md
  const demoMd = fs.readFileSync('d:/JSProjects/CantierProject/DEMO.md', 'utf-8');
  await page.getByTestId('toolbar-toggle-drawer').click();
  await page.waitForTimeout(300);
  await page.getByTestId('raw-markdown-textarea').fill(demoMd);
  await page.waitForTimeout(500);
  await page.getByTestId('toolbar-toggle-drawer').click();
  await page.waitForTimeout(3000); // allow Mermaid & KaTeX to render

  // Set up download listener
  const downloadPromise = page.waitForEvent('download');

  // Click Export PDF
  await page.getByTestId('toolbar-export-pdf').click();

  const download = await downloadPromise;
  const downloadPath = path.join(ARTIFACTS_DIR, 'scratch', 'exported-from-browser.pdf');
  await download.saveAs(downloadPath);
  console.log('Successfully downloaded PDF to:', downloadPath, 'Size:', fs.statSync(downloadPath).size);

  await browser.close();
}

testPdfExportFlow().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
