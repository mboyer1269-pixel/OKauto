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
      exclude: ["**/node_modules/**", "**/e2e/**", "**/*.unit.test.ts"],
      fileParallelism: false,
      poolOptions: { forks: { singleFork: true } },
      globalSetup: ["../../packages/database/test/global-setup.ts"],
      server: {
        deps: {
          external: [/@prisma\/client/, "@okauto/database", "bcryptjs"],
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
