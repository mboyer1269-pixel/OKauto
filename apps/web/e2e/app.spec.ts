import { test, expect } from "@playwright/test";

test.describe("Suivia Auto", () => {
  test("landing page loads", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Chaque véhicule/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Créer mon espace/i }),
    ).toBeVisible();
  });

  test("login page shows demo credentials", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("owner@demo.okauto.local")).toBeVisible();
  });

  test("can login with demo credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "owner@demo.okauto.local");
    await page.fill('input[type="password"]', "Demo1234!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await expect(page.getByText("Brief du matin")).toBeVisible();
  });

  test("inventory page loads after login", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "owner@demo.okauto.local");
    await page.fill('input[type="password"]', "Demo1234!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/dashboard/inventory");
    await expect(
      page.getByRole("heading", { name: "Inventaire" }),
    ).toBeVisible();
    await expect(page.getByText("Ajouter un véhicule")).toBeVisible();
  });

  test("sync health page loads after login", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "owner@demo.okauto.local");
    await page.fill('input[type="password"]', "Demo1234!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/dashboard/sync");
    await expect(
      page.getByRole("heading", { name: "Synchronisation", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Ajouter une source/i }),
    ).toBeVisible();
  });

  test("vehicle detail shows photos section", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "owner@demo.okauto.local");
    await page.fill('input[type="password"]', "Demo1234!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/dashboard/inventory");
    await page
      .locator('a[href^="/dashboard/inventory/"]:not([href$="/new"])')
      .first()
      .click();
    await page.waitForURL(/\/dashboard\/inventory\/[^/]+$/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Photos" })).toBeVisible();
  });

  test("health endpoint returns ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe("ok");
  });
});
