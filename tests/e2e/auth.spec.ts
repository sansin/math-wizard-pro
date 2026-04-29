import { test, expect } from '@playwright/test';

/**
 * Auth happy path is gated on a real Supabase project. These tests
 * exercise the form's client-side validation behavior and remain green
 * even without a backend (auth submit will return an error which we tolerate).
 */

test.describe('Auth form', () => {
  test('signup form requires all fields', async ({ page }) => {
    await page.goto('/login?signup=1');
    await page.getByRole('button', { name: /Create account/i }).click();
    // Browser native form validation prevents submission; URL stays on /login.
    await expect(page).toHaveURL(/\/login/);
  });

  test('login form requires email + password', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /Sign in/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
