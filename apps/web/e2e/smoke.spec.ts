import { test, expect } from '@playwright/test';

test('landing shows brand', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('OKauto').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});

test('login page renders', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});
