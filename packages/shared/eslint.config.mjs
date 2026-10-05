import tseslint from "typescript-eslint";
import base from "../../eslint.config.mjs";

export default tseslint.config(
  ...base,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@okauto/database",
              message: "packages/shared must stay isomorphic — no Prisma.",
            },
          ],
          patterns: [
            {
              group: ["node:*"],
              message: "packages/shared must stay isomorphic — no node: builtins.",
            },
          ],
        },
      ],
    },
  },
);
