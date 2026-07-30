import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests. Requires a seeded database (pnpm db:migrate && pnpm db:seed)
 * and builds/starts the production server automatically.
 */
export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/lotpilot",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "e2e-test-secret",
    },
  },
});
