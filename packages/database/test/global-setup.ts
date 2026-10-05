import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const databaseRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function shouldPrepareDatabase(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return process.env.CI === "true" || url.includes("okauto_test");
}

export default async function setup() {
  if (!shouldPrepareDatabase()) {
    console.log(
      "database globalSetup: skip migrate/seed (DATABASE_URL is not okauto_test and CI is unset)",
    );
    return;
  }

  execSync("pnpm exec prisma migrate deploy", {
    cwd: databaseRoot,
    stdio: "inherit",
    env: process.env,
  });
  execSync("pnpm exec tsx prisma/seed.ts", {
    cwd: databaseRoot,
    stdio: "inherit",
    env: process.env,
  });
}
