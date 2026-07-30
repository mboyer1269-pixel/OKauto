import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. Requires a running app + Postgres. Run locally with:
 *   DATABASE_URL=... AUTH_SECRET=... pnpm --filter @okauto/web build
 *   pnpm --filter @okauto/web test:e2e
 * The webServer block boots `next start` automatically.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm --filter @okauto/web start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
