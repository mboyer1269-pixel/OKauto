import { test, expect } from "@playwright/test";
import { fileURLToPath } from "url";

for (const scenario of ["confirmed", "no-intent", "ambiguous", "changed-after-prompt", "dismissed"] as const) {
  test(`seller cards require a unique identity and explicit confirmation: ${scenario}`, async ({ page }) => {
    const selling = "https://www.facebook.com/marketplace/you/selling";
    await page.route(selling, route => route.fulfill({ contentType: "text/html", body: `
      <main><h1>Vos annonces</h1><article role="article"><span>2024 Buick Envista Avenir</span>
      <p>Stock U12345</p><p>26 495 $CA</p><p>Publié il y a quelques secondes</p>
      <a href="/marketplace/edit?listing_id=123">Modifier</a></article>
      <article role="article"><span>2025 Buick Envista Sport</span><p>26 495 $CA</p></article></main>
      <script type="application/json">{"listing":{"id":"456","marketplace_listing_title":"2025 Buick Envista Sport"}}</script>` }));
    await page.goto(selling);
    await page.evaluate((mode) => {
      const at = Date.now();
      // Recover a click when navigation interrupted the asynchronous storage write.
      if (mode !== "no-intent") sessionStorage.setItem("suivia-marketplace-publish-intent-v1", JSON.stringify({
        vehicleId: "buick", startedAt: at, publishClickedAt: at,
      }));
      if (mode === "ambiguous") {
        const extra = document.querySelector("article")!.cloneNode(true) as HTMLElement;
        extra.querySelector("a")!.setAttribute("href", "/marketplace/edit?listing_id=789");
        document.querySelector("main")!.append(extra);
      }
      Object.assign(window, { chrome: {
        storage: { local: { get: (_: unknown, cb: (value: unknown) => void) => cb({
          pendingRelier: true, pendingPublication: { startedAt: at,
            vehicle: { id: "buick", year: 2024, make: "Buick", model: "Envista", stockNumber: "U12345" } },
        }), remove: () => {} } },
        runtime: { onMessage: { addListener: () => {} }, sendMessage: (
          msg: { type: string; externalUrl?: string; listings?: { externalId: string }[] },
          cb: (r: unknown) => void,
        ) => {
          if (msg.type === "LISTING_CONFIRMED") document.body.dataset.confirmed = msg.externalUrl;
          if (msg.type === "LINK_LISTINGS") document.body.dataset.scan = msg.listings?.map(row => row.externalId).sort().join(",");
          cb({ success: true });
        } },
      } });
    }, scenario);
    await page.addScriptTag({ path: fileURLToPath(new URL("../dist/content.js", import.meta.url)) });
    await expect(page.locator("body")).toHaveAttribute("data-scan", scenario === "ambiguous" ? "123,456,789" : "123,456");
    const confirm = page.getByRole("button", { name: "Confirmer la liaison", exact: true });
    if (scenario === "no-intent" || scenario === "ambiguous") {
      await page.waitForTimeout(1800);
      await expect(confirm).toHaveCount(0);
      await expect(page.locator("body")).not.toHaveAttribute("data-confirmed", /.+/);
      return;
    }
    await expect(confirm).toBeVisible();
    await expect(page.locator("body")).not.toHaveAttribute("data-confirmed", /.+/);
    if (scenario === "dismissed") {
      await page.getByRole("button", { name: "Fermer", exact: true }).click();
      await page.waitForTimeout(1800);
      await expect(confirm).toHaveCount(0);
      return;
    }
    if (scenario === "changed-after-prompt") {
      await page.locator("article p").first().evaluate(node => { node.textContent = "Stock OTHER"; });
    }
    await confirm.click();
    if (scenario === "changed-after-prompt") {
      await expect(page.getByText(/Liaison non confirmée/)).toBeVisible();
      await expect(page.locator("body")).not.toHaveAttribute("data-confirmed", /.+/);
    } else {
      await expect(page.locator("body")).toHaveAttribute("data-confirmed", "https://www.facebook.com/marketplace/item/123/");
    }
  });
}
