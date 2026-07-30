import { test, expect } from "@playwright/test";

test("health endpoint", async ({ request }) => {
  const res = await request.get("/api/v1/health");
  expect(res.ok() || res.status() === 503).toBeTruthy();
  const body = await res.json();
  expect(body.service).toBe("okauto");
});

test("login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("demo login to dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@demo.okauto.local");
  await page.getByLabel("Password").fill("DemoPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible({
    timeout: 15000,
  });
});
