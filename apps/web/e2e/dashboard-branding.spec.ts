import { expect, test } from "@playwright/test";

const viewports = [
  { name: "ordinateur", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
] as const;

for (const viewport of viewports) {
  test(`le nom de la concession ne figure pas sous le logo — ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    // Same seeded demo credentials and login flow as app.spec.ts.
    await page.goto("/login");
    await page.getByRole("textbox", { name: /courriel/i }).fill("owner@demo.okauto.local");
    await page.locator('input[type="password"]').fill("Demo1234!");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    const organizationName = await page.evaluate(() => {
      const raw = window.localStorage.getItem("organization");
      if (!raw) return "";
      const organization = JSON.parse(raw) as { name?: string };
      return organization.name ?? "";
    });
    expect(organizationName.trim(), "Le nom de la concession reste dans la session").not.toBe("");

    const sidebar = page.locator("aside");
    if (viewport.mobile) {
      await expect(sidebar).not.toBeInViewport();
      await expect(page.getByRole("button", { name: "Ouvrir le menu" })).toBeVisible();
      await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    }
    await expect(sidebar).toBeInViewport();

    const branding = sidebar.locator(".cockpit-scan");
    await expect(branding.getByLabel("SUIVIA AUTO")).toBeVisible();
    await expect(branding.locator("p")).toHaveCount(0);
    await expect(branding).not.toContainText(organizationName);

    // Capture the verified desktop/mobile appearance in Playwright's HTML report.
    await testInfo.attach(`sidebar-${viewport.name}`, {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });

    // Removing the label must not erase or modify the stored organization.
    await page.goto("/dashboard/settings");
    await expect(page.getByLabel("Nom du concessionnaire")).toHaveValue(
      organizationName,
    );
  });
}
