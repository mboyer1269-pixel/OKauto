import { expect, test } from "@playwright/test";

test("creates a playable vertical ad from inventory photos", async ({
  page,
}) => {
  await page.goto("/login");
  await page.fill('input[type="email"]', "owner@demo.okauto.local");
  await page.fill('input[type="password"]', "Demo1234!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**");

  const frames = await page.evaluate(() =>
    ["#cb2312", "#2573ad"].map((color) => {
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = 200;
      const context = canvas.getContext("2d")!;
      context.fillStyle = color;
      context.fillRect(0, 0, 300, 200);
      return canvas.toDataURL("image/png");
    }),
  );
  await page.route("**/api/v1/vehicles/video-test", (route) =>
    route.fulfill({
      json: {
        id: "video-test",
        year: 2024,
        make: "Test",
        model: "Démo",
        status: "AVAILABLE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        photos: frames.map((url, i) => ({ id: String(i), url, isPrimary: !i })),
      },
    }),
  );
  await page.route(
    "**/api/v1/vehicles/video-test/photos/download?*",
    (route) => {
      const index = Number(
        new URL(route.request().url()).searchParams.get("index"),
      );
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(frames[index].split(",")[1], "base64"),
      });
    },
  );
  await page.goto("/dashboard/inventory/video-test");
  await page.getByRole("button", { name: "Créer la vidéo" }).click();
  const video = page.locator("video");
  await expect(video).toHaveJSProperty("videoWidth", 720, { timeout: 20000 });
  await expect(video).toHaveJSProperty("videoHeight", 1280);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Télécharger la vidéo" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /2024-Test-Démo\.(mp4|webm)$/,
  );
});
