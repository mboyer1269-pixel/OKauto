import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "path";

export default defineConfig(({ mode }) => {
  Object.assign(
    process.env,
    loadEnv(mode, path.resolve(__dirname, "../.."), ""),
  );

  return {
    test: {
      environment: "node",
      include: ["src/**/__tests__/**/*.test.ts"],
      exclude: ["src/**/__tests__/**/*.unit.test.ts"],
      fileParallelism: false,
      poolOptions: { forks: { singleFork: true } },
      globalSetup: ["../../packages/database/test/global-setup.ts"],
    },
  };
});
