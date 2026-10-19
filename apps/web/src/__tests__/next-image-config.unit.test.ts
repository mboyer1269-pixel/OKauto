import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Next.js image optimizer", () => {
  const config = readFileSync(
    join(__dirname, "..", "..", "next.config.ts"),
    "utf8",
  );

  it("does not allow remote images from any host", () => {
    expect(config).toContain("unoptimized: true");
    expect(config).not.toMatch(/hostname:\s*['"]\*\*['"]/);
    expect(config).not.toContain("placehold.co");
  });

  it("does not import next/image in the app", () => {
    const inventory = readFileSync(
      join(__dirname, "..", "app", "dashboard", "inventory", "page.tsx"),
      "utf8",
    );
    expect(inventory).not.toMatch(/from ['\"]next\/image['\"]/);
    expect(inventory).toContain("<img");
  });
});
