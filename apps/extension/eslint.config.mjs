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
              message: "the Chrome extension must not import the database package.",
            },
          ],
          patterns: [
            {
              group: ["node:*"],
              message: "the Chrome extension must not import node: builtins.",
            },
          ],
        },
      ],
    },
  },
);
