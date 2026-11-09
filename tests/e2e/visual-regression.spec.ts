import { test, expect } from '@playwright/test';

test.describe('Visual Regression & Layout Fidelity Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('wysiwyg-editor')).toBeVisible({ timeout: 15000 });
    // Wait for animations and charts to stabilize
    await page.waitForTimeout(1500);
  });

  test('default editor state visual snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('default-editor-state.png', {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });

  test('active document with 4x4 data table, chart and diagram', async ({ page }) => {
    const editorCanvas = page.locator('.pdf-export-container');
    await expect(editorCanvas).toHaveScreenshot('active-document-canvas.png', {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });

  test('rendered print-preview viewport visual snapshot', async ({ page }) => {
    // Emulate print media
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(1000);

    // Assert print layout
    await expect(page.locator('.pdf-export-container')).toHaveScreenshot('print-preview-viewport.png', {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });
});
