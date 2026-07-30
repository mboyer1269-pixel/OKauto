import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@demo.dev");
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
});

test.describe("inventory workflows", () => {
  test("seeded inventory lists vehicles with statuses", async ({ page }) => {
    await page.goto("/inventory");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await expect(page.getByText("2014 Ford F-150 XLT")).toBeVisible();
    await expect(page.getByText("2019 Tesla Model 3")).toBeVisible();
  });

  test("search narrows the list", async ({ page }) => {
    await page.goto("/inventory");
    await page.getByLabel("Search inventory").fill("Tesla");
    await expect(page.getByText("2019 Tesla Model 3")).toBeVisible();
    await expect(page.getByText("2014 Ford F-150 XLT")).not.toBeVisible();
  });

  test("vehicle detail shows photos, specs and price history", async ({ page }) => {
    await page.goto("/inventory");
    await page.getByRole("link", { name: /2016 Kia Soul/ }).click();
    await page.waitForURL("**/inventory/*");
    await expect(page.getByRole("heading", { name: "Pricing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Specs" })).toBeVisible();
    await expect(page.getByText("P1011").first()).toBeVisible();
    // Two price-history rows from the seed (10,995 → 9,995).
    await expect(page.getByText("$10,995")).toBeVisible();
    await expect(page.getByText("$9,995").first()).toBeVisible();
  });

  test("description generation produces compliant copy", async ({ page }) => {
    await page.goto("/inventory");
    await page.getByRole("link", { name: /2019 Tesla Model 3/ }).click();
    const editor = page.getByLabel("Listing description");
    await editor.fill("");
    await page.getByRole("button", { name: "Generate", exact: true }).click();
    await expect(editor).toHaveValue(/2019 Tesla Model 3/, { timeout: 15_000 });
    await expect(editor).toHaveValue(/licensed dealer/i);
  });

  test("listings page shows lifecycle states and detail transitions", async ({ page }) => {
    await page.goto("/listings");
    await expect(page.getByRole("heading", { name: "Listings" })).toBeVisible();
    await expect(page.getByText("2014 Ford F-150 XLT").first()).toBeVisible();

    await page.goto("/listings");
    await page.getByRole("tab", { name: "Attention" }).click();
    await expect(page.getByText("2018 Hyundai Tucson SEL")).toBeVisible();
    await page.getByRole("link", { name: "2018 Hyundai Tucson SEL" }).first().click();
    await expect(page.getByText("Failure:")).toBeVisible();
    await expect(page.getByRole("button", { name: "→ Queued" })).toBeVisible();
  });

  test("team page lists seeded members and supports invites", async ({ page }) => {
    await page.goto("/team");
    await expect(page.getByText("Sam Seller")).toBeVisible();
    await expect(page.getByText("Riley Deals")).toBeVisible();

    await page.getByLabel("Email").fill(`e2e-invite-${Date.now()}@test.dev`);
    await page.getByRole("button", { name: "Create invite link" }).click();
    await expect(page.getByText(/Share this link/)).toBeVisible();
  });

  test("analytics renders salesperson activity", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page.getByText("Listings published per day")).toBeVisible();
    await expect(page.getByRole("table").getByText("Sam Seller")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sync health" })).toBeVisible();
  });

  test("settings extension tab issues a pairing token", async ({ page }) => {
    await page.goto("/settings?tab=extension");
    await page.getByPlaceholder(/Token label/).fill("E2E token");
    await page.getByRole("button", { name: "Create token" }).click();
    await expect(page.getByText(/oka_ext_/)).toBeVisible();
  });
});
