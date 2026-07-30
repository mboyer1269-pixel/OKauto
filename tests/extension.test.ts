import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

interface Manifest {
  manifest_version: number;
  permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
  content_scripts?: Array<{ matches?: string[] }>;
}

describe("Manifest V3 policy boundaries", () => {
  it("uses MV3, least-privilege core permissions, and scoped content scripts", async () => {
    const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8")) as Manifest;
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).not.toContain("webRequest");
    expect(manifest.permissions).not.toContain("cookies");
    expect(manifest.host_permissions).not.toContain("<all_urls>");
    const matches = manifest.content_scripts?.flatMap((script) => script.matches ?? []) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((match) => match.startsWith("https://www.facebook.com/marketplace/create"))).toBe(true);
  });

  it("does not contain automated submission or protection-bypass behavior", async () => {
    const content = await readFile(new URL("../extension/src/content.ts", import.meta.url), "utf8");
    expect(content).not.toMatch(/captcha|querySelector\([^)]*(publish|submit|next)/i);
    expect(content).not.toMatch(/\.click\(\)/);
  });
});
