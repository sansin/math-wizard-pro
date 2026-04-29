import { test, expect } from '@playwright/test';

test.describe('Landing page', () => {
  test('renders hero and CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Practice math like it.s a quest/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Get started/i }).first()).toBeVisible();
  });

  test('Get started → /login?signup=1', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Start free/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: /Create your account/i })).toBeVisible();
  });

  test('Import from Classic → /migrate', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Import from Classic/i }).click();
    await expect(page).toHaveURL(/\/migrate/);
    await expect(page.getByRole('heading', { name: /Import from Classic Math Wizard/i })).toBeVisible();
  });

  test('Sign in toggle on login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();
    await page.getByRole('button', { name: /Sign up free/i }).click();
    await expect(page.getByRole('heading', { name: /Create your account/i })).toBeVisible();
  });
});
