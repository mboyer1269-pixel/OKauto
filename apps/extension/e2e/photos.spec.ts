import { test, expect } from "@playwright/test";
import { fileURLToPath } from "url";

// A local fixture, never a live Facebook account or publication. Execute the
// actual shipped content.js as a classic script, with the Chrome transport mocked.
for (const scenario of [
  "normal",
  "replaced-input",
  "denied",
  "partial",
  "no-previews",
] as const) {
  test(`photo transfer: ${scenario}`, async ({ page }) => {
    test.setTimeout(60000);
    const url = "https://www.facebook.com/marketplace/create/vehicle";
    await page.route(url, route => route.fulfill({ contentType: "text/html", body: "<html></html>" }));
    await page.goto(url);
    await page.setContent(`
      <button role="combobox" aria-label="Vehicle type">Type</button>
      <button role="combobox" aria-label="Year">Year</button>
      <button role="combobox" aria-label="Make">Make</button>
      <div role="option">Car/Truck</div><div role="option">2024</div><div role="option">GMC</div>
      <button role="combobox" aria-label="Style de carrosserie"></button>
      <button role="combobox" aria-label="Couleur intérieure"></button>
      <div role="option" onclick="this.dataset.selected='yes'">VUS</div>
      <div role="option" onclick="this.dataset.selected='yes'">Noir</div>
      <input aria-label="Model"><input aria-label="Title">
      <textarea aria-label="Description"></textarea>
      <input id="disabled" type="file" accept="image/*" multiple disabled>
      <input id="video" type="file" accept="video/*" multiple>
      <input id="photos" type="file" accept=".jpg,.png" multiple hidden>
      <div id="previews"></div>
      <button id="publish">Publier</button>
    `);
    await page.evaluate((mode) => {
      const pending = {
        vehicle: {
          id: "fixture",
          year: 2024,
          make: "GMC",
          model: "Sierra",
          description: "Fixture",
          interiorColor: "Jet Black",
          bodyStyle: "VUS",
          photos: ["one", "two"],
        },
        startedAt: Date.now(),
      };
      const state = window as unknown as {
        chrome: unknown;
        runFill: () => Promise<unknown>;
        received: string[];
      };
      state.received = [];
      document.addEventListener("change", (event) => {
        const input = event.target as HTMLInputElement;
        if (input.id !== "photos") return;
        state.received = Array.from(input.files ?? []).map((file) => file.name);
        for (const file of mode === "no-previews"
          ? []
          : Array.from(input.files ?? [])) {
          const img = document.createElement("img");
          img.src = URL.createObjectURL(file);
          img.alt = "Photo preview";
          document.getElementById("previews")!.append(img);
        }
        // Facebook/React may reset the input after accepting the files.
        input.value = "";
      });
      state.chrome = {
        storage: {
          local: {
            get: (_keys: unknown, callback: (data: object) => void) =>
              callback({}),
            set: () => {},
            remove: () => {},
          },
        },
        runtime: {
          onMessage: {
            addListener: (
              listener: (
                message: object,
                sender: object,
                callback: (result: unknown) => void,
              ) => void,
            ) => {
              state.runFill = () =>
                new Promise((resolve) =>
                  listener(
                    { type: "FILL_MARKETPLACE_FORM", vehicle: pending.vehicle },
                    {},
                    resolve,
                  ),
                );
            },
          },
          sendMessage: (
            message: { type: string; index: number },
            callback: (result: object) => void,
          ) => {
            if (message.type !== "GET_VEHICLE_PHOTO") {
              callback({ success: true });
              return;
            }
            if (mode === "replaced-input" && message.index === 0) {
              const input = document.getElementById("photos")!;
              input.replaceWith(input.cloneNode(true));
            }
            if (
              mode === "denied" ||
              (mode === "partial" && message.index === 1)
            ) {
              callback({
                success: false,
                error: "Clé API invalide. Reconnectez l'extension.",
              });
              return;
            }
            callback({
              success: true,
              filename: `${message.index}.png`,
              contentType: "image/png",
              base64:
                "iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAyUlEQVR4nO3QQREAIRDAsAX/nu9UUB4kCjpdM99w3r4d8AqjI0ZHjI4YHTE6YnTE6IjREaMjRkeMjhgdMTpidMToiNERoyNGR4yOGB0xOmJ0xOiI0RGjI0ZHjI4YHTE6YnTE6IjREaMjRkeMjhgdMTpidMToiNERoyNGR4yOGB0xOmJ0xOiI0RGjI0ZHjI4YHTE6YnTE6IjREaMjRkeMjhgdMTpidMToiNERoyNGR4yOGB0xOmJ0xOiI0RGjI0ZHjI4YHTE6YnTkBxavAZ/Sos9KAAAAAElFTkSuQmCC",
            });
          },
        },
      };
    }, scenario);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addScriptTag({
      path: fileURLToPath(new URL("../dist/content.js", import.meta.url)),
    });
    const report = await page.evaluate(() =>
      (
        window as unknown as {
          runFill: () => Promise<{
            issues: { field: string; message: string }[];
          }>;
        }
      ).runFill(),
    );
    const received = await page.evaluate(
      () => (window as unknown as { received: string[] }).received,
    );
    expect(errors).toEqual([]);
    if (scenario === "normal") {
      // A popup can fill an already-open tab with no pending state at startup.
      // The trusted user click must use the vehicle just prepared by that message.
      await page.getByRole("button", { name: "Publier", exact: true }).click();
      const intent = await page.evaluate(() => JSON.parse(
        sessionStorage.getItem("suivia-marketplace-publish-intent-v1") || "null",
      ));
      expect(intent?.vehicleId).toBe("fixture");
      expect(intent?.publishClickedAt).toBeGreaterThanOrEqual(intent?.startedAt);
    }
    await expect(page.locator('[role=option][data-selected=yes]')).toHaveCount(2);
    if (scenario === "denied") {
      expect(received).toEqual([]);
      expect(report.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "photos",
            message: expect.stringContaining("Clé API invalide"),
          }),
        ]),
      );
    } else {
      expect(received).toEqual(
        scenario === "partial" ? ["0.png"] : ["0.png", "1.png"],
      );
      expect(
        report.issues.filter((issue) => issue.field === "photos"),
      ).toHaveLength(
        scenario === "partial" || scenario === "no-previews" ? 1 : 0,
      );
    }
    const video = await page.locator("#video").evaluate((input: HTMLInputElement) => {
      const file = input.files?.[0];
      return file ? { size: file.size, type: file.type, name: file.name } : null;
    });
    if (scenario === "denied") expect(video).toBeNull();
    else {
      expect(video?.size).toBeGreaterThan(100);
      expect(video?.type).toMatch(/^video\/(mp4|webm)$/);
      expect(video?.name).toContain("fixture");
    }
  });
}
