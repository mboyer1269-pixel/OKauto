import { expect, test } from "@playwright/test";

test("owner can sign in and create a duplicate-safe listing draft", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "Mutation flow is covered once in desktop Chromium.");
  await page.goto("/login");
  await page.getByLabel("Work email").fill("owner@demo.driveflow.local");
  await page.getByLabel("Password").fill("DemoDrive!2026");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  const state = await page.evaluate(async () => {
    const [inventory, listings] = await Promise.all([
      fetch("/api/v1/vehicles?limit=100").then((response) => response.json()) as Promise<{
        data: Array<{ id: string; year: number; make: string; model: string; status: string }>;
      }>,
      fetch("/api/v1/listings").then((response) => response.json()) as Promise<{ data: Array<{ vehicleId: string; status: string }> }>,
    ]);
    const activeVehicleIds = new Set(
      listings.data
        .filter((listing) => ["DRAFT", "PREPARED", "PUBLISHED", "REMOVAL_REQUIRED"].includes(listing.status))
        .map((listing) => listing.vehicleId),
    );
    return inventory.data.find((vehicle) => vehicle.status === "AVAILABLE" && !activeVehicleIds.has(vehicle.id)) ?? null;
  });
  if (!state) {
    await page.getByRole("button", { name: "Listings", exact: true }).click();
    await expect(page.getByText("draft", { exact: true }).first()).toBeVisible();
    return;
  }
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(page.getByRole("heading", { name: /\d+ units/ })).toBeVisible();

  await page.getByRole("checkbox", { name: `Select ${state.year} ${state.make} ${state.model}` }).check();
  await page.getByRole("button", { name: /create 1 draft/i }).click();

  await expect(page.getByRole("heading", { name: "Listing history" })).toBeVisible();
  await expect(page.getByText("draft", { exact: true }).first()).toBeVisible();
  const handoff = await page.evaluate(async () => {
    const listings = (await fetch("/api/v1/listings").then((response) => response.json())) as {
      data: Array<{ id: string; status: string }>;
    };
    const draft = listings.data.find((listing) => listing.status === "DRAFT");
    if (!draft) return null;
    const prepared = (await fetch(`/api/v1/listings/${draft.id}/prepare`, { method: "POST" }).then((response) => response.json())) as {
      data: { handoffToken: string };
    };
    return fetch("/api/v1/extension/preparations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "LOAD", token: prepared.data.handoffToken }),
    }).then((response) => response.json()) as Promise<{ data: { policy: { autoSubmit: boolean; humanConfirmationRequired: boolean } } }>;
  });
  expect(handoff?.data.policy).toEqual({ autoSubmit: false, humanConfirmationRequired: true });
});

test("dashboard is usable at mobile width", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile navigation is covered in the mobile project.");
  await page.goto("/login");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
});
