import { test, expect } from '@playwright/test';

/** Lightweight a11y smoke checks. Full WCAG audit happens in CI via axe. */

test.describe('Accessibility smoke', () => {
  test('landing has skip-to-content', async ({ page }) => {
    await page.goto('/');
    const skip = page.locator('a:has-text("Skip to content")');
    await expect(skip).toBeAttached();
  });

  test('all interactive elements have accessible names', async ({ page }) => {
    await page.goto('/');
    const buttons = await page.getByRole('button').all();
    for (const b of buttons) {
      const name = await b.getAttribute('aria-label') ?? await b.textContent();
      expect((name ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  test('respects prefers-reduced-motion (no animation classes break interactivity)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('link', { name: /Start free/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
  });
});
