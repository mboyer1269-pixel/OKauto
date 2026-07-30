import { expect, test } from "@playwright/test";

test("owner can sign in and create a duplicate-safe listing draft", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Work email").fill("owner@demo.driveflow.local");
  await page.getByLabel("Password").fill("DemoDrive!2026");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.getByRole("button", { name: "Inventory" }).click();
  await expect(page.getByRole("heading", { name: /\d+ units/ })).toBeVisible();

  const firstAvailable = page.locator('input[type="checkbox"]:not(:disabled)').first();
  await firstAvailable.check();
  await page.getByRole("button", { name: /create 1 draft/i }).click();

  await expect(page.getByRole("heading", { name: "Listing history" })).toBeVisible();
  await expect(page.getByText("draft", { exact: true }).first()).toBeVisible();
});

test("dashboard is usable at mobile width", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
});
