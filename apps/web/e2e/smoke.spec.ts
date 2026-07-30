import { expect, test } from '@playwright/test';

/**
 * Smoke E2E covering the critical onboarding path: landing → register → dashboard.
 * Uses a unique email per run so it can execute repeatedly against a live database.
 */
test('landing page renders and links to auth', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /list more inventory/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /get started/i }).first()).toBeVisible();
});

test('a new dealership can register and reach the dashboard', async ({ page }) => {
  const unique = Date.now();
  await page.goto('/register');
  await page.getByLabel('Dealership name').fill(`E2E Motors ${unique}`);
  await page.getByLabel('Your name').fill('E2E Tester');
  await page.getByLabel('Email').fill(`e2e+${unique}@okauto.dev`);
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: /create dealership/i }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: /overview/i })).toBeVisible();
});
