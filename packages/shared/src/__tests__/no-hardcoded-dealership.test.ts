import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

const ROOTS = [
  "apps/web/src",
  "apps/extension/src",
  "apps/worker/src",
  "packages/shared/src",
  "packages/database/prisma/seed.ts",
];

const FORBIDDEN = [
  /Buckingham/i,
  /BuckinghamGM/i,
  /Chevrolet Buick GMC/i,
];

function shouldSkip(filePath: string) {
  return (
    filePath.includes(`${path.sep}__tests__${path.sep}`) ||
    filePath.includes(".test.") ||
    filePath.includes("no-hardcoded-dealership")
  );
}

function collectFiles(target: string): string[] {
  const absolute = path.join(REPO_ROOT, target);
  const stats = statSync(absolute);
  if (stats.isFile()) return shouldSkip(absolute) ? [] : [absolute];
  return readdirSync(absolute).flatMap((entry) => {
    const next = path.join(target, entry);
    const nextAbsolute = path.join(REPO_ROOT, next);
    const nextStats = statSync(nextAbsolute);
    if (nextStats.isDirectory()) return collectFiles(next);
    if (!/\.(ts|tsx|js|jsx)$/.test(entry)) return [];
    return shouldSkip(nextAbsolute) ? [] : [nextAbsolute];
  });
}

describe("no hardcoded dealership identity", () => {
  it("fails if Buckingham or hardcoded dealer brands reappear in product code", () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const file of collectFiles(root)) {
        const text = readFileSync(file, "utf8");
        for (const pattern of FORBIDDEN) {
          if (pattern.test(text)) {
            hits.push(`${path.relative(REPO_ROOT, file)} (${pattern})`);
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
