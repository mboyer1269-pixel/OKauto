import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(path.resolve(__dirname, "../public/manifest.json"), "utf8"));

describe("MV3 manifest", () => {
  it("declares manifest v3 with required entries", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background.service_worker).toBe("background.js");
    expect(manifest.background.type).toBe("module");
    expect(manifest.side_panel.default_path).toBe("panel.html");
    expect(manifest.action.default_popup).toBe("popup.html");
  });

  it("requests only the permissions the extension needs", () => {
    expect(manifest.permissions.sort()).toEqual(["alarms", "sidePanel", "storage", "tabs"]);
    // No blanket <all_urls>; content script is scoped to Facebook only.
    for (const cs of manifest.content_scripts) {
      for (const match of cs.matches) {
        expect(match).toMatch(/^https:\/\/(www|web)\.facebook\.com\/\*$/);
      }
    }
  });

  it("does not request scripting/webRequest/cookies (no covert automation)", () => {
    for (const banned of ["scripting", "webRequest", "cookies", "debugger"]) {
      expect(manifest.permissions).not.toContain(banned);
    }
  });
});
