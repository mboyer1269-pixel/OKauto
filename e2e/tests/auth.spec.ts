import { expect, test } from "@playwright/test";

test.describe("authentication", () => {
  test("register creates an org and lands on the dashboard checklist", async ({ page }) => {
    const email = `e2e-${Date.now()}@test.dev`;
    await page.goto("/register");

    await page.getByLabel("Dealership name").fill(`E2E Motors ${Date.now()}`);
    await page.getByLabel("Your name").fill("E2E Owner");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password").fill("e2e-password-123");
    await page.getByRole("button", { name: "Create organization" }).click();

    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Getting started")).toBeVisible();
    await expect(page.getByText("Add your first inventory")).toBeVisible();
  });

  test("login with the seeded demo account shows inventory stats", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("owner@demo.dev");
    await page.getByLabel("Password").fill("demo-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    await expect(page.getByText("Live listings")).toBeVisible();
    await expect(page.getByText("Active inventory")).toBeVisible();
  });

  test("bad credentials show an error and stay on login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("owner@demo.dev");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password" })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated users are redirected to login", async ({ page }) => {
    await page.goto("/inventory");
    await page.waitForURL("**/login");
  });
});
