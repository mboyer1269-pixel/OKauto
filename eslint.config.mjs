import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "apps/extension/public/**",
      "apps/web/next-env.d.ts",
      "packages/database/src/generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // TypeScript already performs undefined-name checking.
      "no-undef": "off",
    },
  },
  {
    files: ["**/*.mjs", "**/*.cjs"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        fetch: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
