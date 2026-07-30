import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outdir = root; // load unpacked from apps/extension root
const watch = process.argv.includes("--watch");

mkdirSync(join(root, "icons"), { recursive: true });

const options = {
  entryPoints: {
    background: join(root, "src/background.ts"),
    content: join(root, "src/content.ts"),
    popup: join(root, "src/popup.ts"),
  },
  bundle: true,
  outdir: root,
  format: "esm",
  target: ["chrome120"],
  sourcemap: true,
  logLevel: "info",
};

async function run() {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log("watching extension…");
  } else {
    await esbuild.build(options);
    console.log("extension built");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
