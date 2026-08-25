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
    },
  };
});
