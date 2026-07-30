import { defineConfig, devices } from "@playwright/test";

const API_PORT = process.env.E2E_API_PORT ?? "4000";
const WEB_PORT = process.env.E2E_WEB_PORT ?? "3000";
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://okauto:okauto_dev_password@localhost:5432/okauto";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @okauto/api exec tsx src/index.ts",
      cwd: "..",
      url: `http://localhost:${API_PORT}/healthz`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: "development",
        DATABASE_URL,
        JWT_SECRET: "e2e-secret-e2e-secret-e2e-secret",
        API_PORT,
        API_HOST: "127.0.0.1",
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        RUN_WORKER: "true",
        JOB_QUEUE_POLL_MS: "500",
      },
    },
    {
      command: "pnpm --filter @okauto/web start",
      cwd: "..",
      url: `http://localhost:${WEB_PORT}/login`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        API_INTERNAL_URL: `http://localhost:${API_PORT}`,
        PORT: WEB_PORT,
      },
    },
  ],
});
