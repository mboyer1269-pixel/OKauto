import { test, expect } from "@playwright/test";

test.describe("Suivia Auto", () => {
  test("landing page loads", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Du NIV à vendu/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Se connecter" }).first(),
    ).toHaveAttribute("href", "/login");
    const createSpace = page.getByRole("link", { name: "Créer mon espace" });
    await expect(createSpace.first()).toHaveAttribute("href", "/demande-acces");
  });

  test("access request form records a request without opening signup", async ({
    page,
  }) => {
    await page.goto("/demande-acces");
    await expect(
      page.getByRole("heading", { name: "Demander un accès" }),
    ).toBeVisible();
    const consent = page.getByRole("checkbox");
    await expect(consent).not.toBeChecked();
    await expect(
      page.getByRole("link", { name: "Confidentialité" }),
    ).toHaveAttribute("href", "/confidentialite");

    await page.getByLabel("Nom").fill("Camille Rivard");
    await page.getByLabel("Concession").fill("Rivard Auto");
    await page.getByLabel("Courriel").fill(`e2e-access-${Date.now()}@example.com`);
    await page.getByLabel(/Téléphone/).fill("514-555-0100");
    await page
      .getByLabel("Message")
      .fill("Nous voulons publier notre inventaire.");
    await consent.check();
    await page.getByRole("button", { name: "Envoyer la demande" }).click();
    await expect(
      page.getByText("Votre demande a été enregistrée."),
    ).toBeVisible();
  });

  test("closed register page links to the access request form", async ({
    page,
  }) => {
    await page.goto("/register");
    await expect(
      page.getByRole("heading", { name: "Inscriptions fermées" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Demander un accès" }),
    ).toHaveAttribute("href", "/demande-acces");
  });

  test("login page shows demo credentials", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("owner@demo.okauto.local")).toBeVisible();
    await expect(
      page.getByLabel("SUIVIA AUTO").locator("visible=true").first(),
    ).toBeVisible();
  });

  test("can login with demo credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "owner@demo.okauto.local");
    await page.fill('input[type="password"]', "Demo1234!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await expect(page.getByText("Brief du matin")).toBeVisible();
    await expect(
      page.getByLabel("SUIVIA AUTO").locator("visible=true").first(),
    ).toBeVisible();
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
      .locator("visible=true")
      .first()
      .click();
    await page.waitForURL(/\/dashboard\/inventory\/[^/]+$/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Photos" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Build d.usine/ })).toBeVisible();
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
      .locator("article")
      .filter({ has: page.locator("img") })
      .first()
      .getByRole("button", { name: "Publier", exact: true })
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

  test("Marketplace description stays raw until copy or save", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "owner@demo.okauto.local");
    await page.fill('input[type="password"]', "Demo1234!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await page.goto("/dashboard/listings");
    await page.getByRole("tab", { name: /À préparer/ }).click();
    await page
      .getByRole("button", { name: "Publier", exact: true })
      .first()
      .click();

    const dialog = page.getByRole("dialog", { name: "Préparer l’annonce" });
    await expect(dialog).toBeVisible();
    await dialog
      .locator("summary")
      .filter({ hasText: "Voir ou copier le contenu de l’annonce" })
      .click();

    const description = dialog.getByLabel("Description", { exact: true });
    await expect(description).toBeEditable();
    await expect(description).not.toHaveValue("");

    await description.fill("");
    await expect(description).toHaveValue("");

    const editedMention =
      "Voici le GMC Terrain d’occasion en inventaire.\n\nRapport Carfax modifié pour cet essai.";
    await description.fill(editedMention);
    await expect(description).toHaveValue(editedMention);
    expect(
      (await description.inputValue()).match(/carfax/gi) ?? [],
    ).toHaveLength(1);

    await description.fill("Belle auto.");
    await expect(description).toHaveValue("Belle auto.");
    await dialog
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect(
      page.getByText("La description doit contenir au moins 80 caractères."),
    ).toBeVisible();
  });

  test("health endpoint returns ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe("ok");
  });
});
