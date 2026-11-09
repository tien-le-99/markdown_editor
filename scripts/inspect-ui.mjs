import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACTS_DIR = 'C:/Users/tienl/.gemini/antigravity-ide/brain/d47980ee-459e-43cd-bbcb-7f6219caf868';
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, 'screenshots');

async function captureFocusedVisuals() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Capture ECharts block
  const echartsNode = page.getByTestId('echarts-node-view');
  await echartsNode.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  const shot4Path = path.join(SCREENSHOTS_DIR, '04-echarts-interactive-view.png');
  await echartsNode.screenshot({ path: shot4Path });

  // Capture Mermaid block
  const mermaidNode = page.getByTestId('mermaid-node-view');
  await mermaidNode.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  const shot5Path = path.join(SCREENSHOTS_DIR, '05-mermaid-diagram-view.png');
  await mermaidNode.screenshot({ path: shot5Path });

  // Open Markdown Drawer and capture split view
  const splitBtn = page.getByTestId('toolbar-toggle-drawer');
  await splitBtn.click();
  await page.waitForTimeout(1000);
  const shot6Path = path.join(SCREENSHOTS_DIR, '06-split-drawer-editing.png');
  await page.screenshot({ path: shot6Path });

  await browser.close();
  console.log('Focused screenshots captured successfully!');
}

captureFocusedVisuals().catch(err => {
  console.error('Failed to capture focused visuals:', err);
  process.exit(1);
});
