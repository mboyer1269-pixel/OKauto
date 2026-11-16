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
    await page.setContent(`
      <button role="combobox" aria-label="Vehicle type">Type</button>
      <button role="combobox" aria-label="Year">Year</button>
      <button role="combobox" aria-label="Make">Make</button>
      <div role="option">Car/Truck</div><div role="option">2024</div><div role="option">GMC</div>
      <input aria-label="Model"><input aria-label="Title">
      <textarea aria-label="Description"></textarea>
      <input id="disabled" type="file" accept="image/*" multiple disabled>
      <input id="video" type="file" accept="video/*" multiple>
      <input id="photos" type="file" accept=".jpg,.png" multiple hidden>
      <div id="previews"></div>
    `);
    await page.evaluate((mode) => {
      const pending = {
        vehicle: {
          id: "fixture",
          year: 2024,
          make: "GMC",
          model: "Sierra",
          description: "Fixture",
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
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=",
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
    expect(
      await page
        .locator("#video")
        .evaluate((input: HTMLInputElement) => input.files!.length),
    ).toBe(0);
  });
}
