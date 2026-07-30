import { expect, test } from "@playwright/test";

/** Smoke E2E against the seeded demo data (see packages/db/src/seed.ts). */

test("rejects invalid credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@sunrisemotors.test");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password")).toBeVisible();
});

test("owner signs in, sees the dashboard, and browses inventory", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@sunrisemotors.test");
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Available vehicles")).toBeVisible();

  await page.getByRole("link", { name: "Inventory" }).first().click();
  await expect(page.getByRole("heading", { name: /Inventory/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Honda Accord/ }).first()).toBeVisible();

  // Vehicle detail with description generator
  await page
    .getByRole("link", { name: /Honda Accord/ })
    .first()
    .click();
  await expect(page.getByText("Marketplace description")).toBeVisible();
  await expect(page.getByText("Specifications")).toBeVisible();
});

test("salesperson sees own listings and notifications", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("bri@sunrisemotors.test");
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Listings" }).first().click();
  await expect(page.getByRole("heading", { name: /My listings/ })).toBeVisible();

  await page
    .getByRole("link", { name: /Notifications/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
});
