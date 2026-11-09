import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACTS_DIR = 'C:/Users/tienl/.gemini/antigravity-ide/brain/868e04e5-c130-4ee3-a977-c7d31b0b90c7';
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, 'screenshots');

async function testInlineCode() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Open drawer and insert markdown with various backtick strings
  const drawerBtn = page.getByTestId('toolbar-toggle-drawer');
  await drawerBtn.click();
  await page.waitForTimeout(500);

  const textarea = page.getByTestId('raw-markdown-textarea');
  const sampleMd = `# Testing Inline Code & Backtick Rendering

Here is standard text with inline code: \`036486583523\` and \`"my_string_variable"\`.

AI frequently uses backticks for paths like \`d:/JSProjects/CantierProject/DEMO.md\` and commands like \`npm run dev\`.

Double backtick spans with internal backtick: \`\`special \` code\`\`.

- List item with inline parameter: \`TENANT_ID\` and \`TARGET_ACCOUNT_ID\`
- URL endpoint: \`GET /tenants/{id}\` reporting \`status: "ACTIVE"\`
`;

  await textarea.fill(sampleMd);
  await page.waitForTimeout(1000);

  // Close drawer
  await drawerBtn.click();
  await page.waitForTimeout(1000);

  // Capture screenshot of the rendered code badges in WYSIWYG
  const canvas = page.locator('main > div');
  const shotPath = path.join(SCREENSHOTS_DIR, '04-inline-code-rendering.png');
  await canvas.screenshot({ path: shotPath });
  console.log('Saved 04-inline-code-rendering.png successfully!');

  await browser.close();
}

testInlineCode().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
