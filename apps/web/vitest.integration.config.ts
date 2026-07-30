import { defineConfig } from "vitest/config";
import path from "node:path";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/lotpilot_test";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["test/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["test/integration/global-setup.ts"],
    // API route handlers share one database; run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      SESSION_SECRET: "test-secret-for-integration-tests",
      NODE_ENV: "test",
      VIN_DECODER_ONLINE: "false",
    },
  },
});
