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

  test("personal Marketplace draft can be edited, saved, and advanced", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/login");
    await page.fill('input[type="email"]', "owner@demo.okauto.local");
    await page.fill('input[type="password"]', "Demo1234!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/dashboard/listings");

    await expect(
      page.getByRole("heading", { name: "Centre de publication Marketplace" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: /À préparer/ }).click();
    await page
      .getByRole("button", { name: "Publier", exact: true })
      .first()
      .click();

    const dialog = page.getByRole("dialog", { name: "Préparer l’annonce" });
    await expect(dialog).toBeVisible();
    const vehicleHeading = dialog.getByRole("heading", { level: 2 });
    const firstVehicleName = await vehicleHeading.innerText();
    await dialog
      .locator("summary")
      .filter({ hasText: "Voir ou copier le contenu de l’annonce" })
      .click();

    const title = dialog.getByLabel("Titre", { exact: true });
    await expect(title).toBeEditable();
    const originalTitle = await title.inputValue();
    await title.fill(`${originalTitle.slice(0, 80)} essai`);

    await expect(dialog.getByText("Publication bloquée")).toBeVisible();
    const save = dialog.getByRole("button", {
      name: "Enregistrer",
      exact: true,
    });
    await expect(save).toBeEnabled();

    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/marketplace-draft") &&
        response.request().method() === "PUT",
    );
    await save.click();
    expect((await saveResponse).status()).toBe(200);
    await expect(
      page.getByText(
        "Brouillon enregistré pour votre profil et prêt pour l’extension.",
      ),
    ).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "Publier sur Marketplace" }),
    ).not.toHaveAttribute("aria-disabled", "true");

    await title.fill(`${originalTitle.slice(0, 76)} suivant`);
    const nextResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/marketplace-draft") &&
        response.request().method() === "PUT",
    );
    await dialog
      .getByRole("button", { name: "Enregistrer et suivant" })
      .click();
    expect((await nextResponse).status()).toBe(200);
    await expect(vehicleHeading).not.toHaveText(firstVehicleName);
    expect(pageErrors).toEqual([]);
  });

  test("health endpoint returns ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe("ok");
  });
});
