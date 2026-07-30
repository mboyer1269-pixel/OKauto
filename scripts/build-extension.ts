import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { build } from "esbuild";

const root = process.cwd();
const source = resolve(root, "extension");
const output = resolve(source, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(
  ["manifest.json", "sidepanel.html", "sidepanel.css"].map((file) => cp(resolve(source, file), resolve(output, file))),
);
await build({
  entryPoints: {
    "service-worker": resolve(source, "src/service-worker.ts"),
    content: resolve(source, "src/content.ts"),
    sidepanel: resolve(source, "src/sidepanel.ts"),
  },
  outdir: output,
  bundle: true,
  format: "esm",
  target: "chrome116",
  minify: true,
  sourcemap: false,
  legalComments: "none",
});

console.info(`Built Manifest V3 extension at ${output}`);
