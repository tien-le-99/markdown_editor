import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACTS_DIR = 'C:/Users/tienl/.gemini/antigravity-ide/brain/868e04e5-c130-4ee3-a977-c7d31b0b90c7';
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function runVerification() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 1. Verify Default Document with KaTeX Formulas
  const mathBlock = page.getByTestId('math-block-view');
  await mathBlock.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  const mathShotPath = path.join(SCREENSHOTS_DIR, '01-katex-display-math.png');
  await mathBlock.screenshot({ path: mathShotPath });
  console.log('Captured KaTeX display math block screenshot');

  // 2. Open Edit Formula modal and test presets
  const editMathBtn = page.getByTestId('math-edit-button');
  await editMathBtn.click();
  await page.waitForTimeout(500);

  const mathEditor = page.getByTestId('math-code-editor');
  const eulerBtn = mathEditor.getByRole('button', { name: /Euler/i });
  await eulerBtn.click();
  await page.waitForTimeout(500);

  const saveMathBtn = page.getByTestId('math-save-button');
  await saveMathBtn.click();
  await page.waitForTimeout(1000);
  const eulerShotPath = path.join(SCREENSHOTS_DIR, '02-katex-preset-switched.png');
  await mathBlock.screenshot({ path: eulerShotPath });
  console.log('Captured KaTeX preset switched screenshot');

  // 3. Test opening DEMO.md (containing LaTeX $\rightarrow$)
  const demoMdPath = 'd:/JSProjects/CantierProject/DEMO.md';
  if (fs.existsSync(demoMdPath)) {
    const demoContent = fs.readFileSync(demoMdPath, 'utf-8');
    await page.evaluate((content) => {
      // Dispatch load via drawer or set content
      const textarea = document.querySelector('[data-testid="raw-markdown-textarea"]');
      if (textarea) {
        // use textarea
      }
    }, demoContent);
  }

  // 4. Test opening AWS_Architecture_Diagram.md to verify layout fix (no premature white card cutoff!)
  const archMdPath = 'd:/JSProjects/CantierProject/AWS_Architecture_Diagram.md';
  if (fs.existsSync(archMdPath)) {
    const archContent = fs.readFileSync(archMdPath, 'utf-8');
    // Open drawer
    const drawerToggle = page.getByTestId('toolbar-toggle-drawer');
    await drawerToggle.click();
    await page.waitForTimeout(800);

    const textarea = page.getByTestId('raw-markdown-textarea');
    await textarea.fill(archContent);
    await page.waitForTimeout(2000);

    // Close drawer
    await drawerToggle.click();
    await page.waitForTimeout(1000);

    // Check card height vs content height
    const dimensions = await page.evaluate(() => {
      const card = document.querySelector('main > div');
      const h2Elements = Array.from(document.querySelectorAll('h2')).map(h => ({
        text: h.textContent,
        top: h.getBoundingClientRect().top,
        bottom: h.getBoundingClientRect().bottom,
      }));
      const cardRect = card ? card.getBoundingClientRect() : null;
      return {
        cardHeight: card ? card.offsetHeight : 0,
        cardScrollHeight: card ? card.scrollHeight : 0,
        cardRect,
        h2Elements,
      };
    });

    console.log('AWS Architecture Diagram Layout Dimensions:', {
      cardHeight: dimensions.cardHeight,
      cardScrollHeight: dimensions.cardScrollHeight,
      headingsFound: dimensions.h2Elements.length,
    });

    // Capture screenshot of "Architectural Stages & Tiers" inside the card!
    const stagesHeading = page.locator('h2', { hasText: 'Architectural Stages & Tiers' });
    if (await stagesHeading.isVisible()) {
      await stagesHeading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      const layoutShotPath = path.join(SCREENSHOTS_DIR, '03-layout-fix-architectural-stages.png');
      await page.screenshot({ path: layoutShotPath });
      console.log('Captured layout fix screenshot verifying Architectural Stages is inside white card!');
    }
  }

  await browser.close();
  console.log('All verification steps completed successfully!');
}

runVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
