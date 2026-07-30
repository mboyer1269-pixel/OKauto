// Extension build: esbuild bundles + static asset copy. Zero-config, deterministic.
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const shared = {
  bundle: true,
  format: "esm",
  target: "chrome116",
  sourcemap: true,
  logLevel: "info",
};

await Promise.all([
  build({ ...shared, entryPoints: [join(root, "src/background/service-worker.ts")], outfile: join(dist, "background.js") }),
  build({ ...shared, entryPoints: [join(root, "src/content/marketplace-assist.ts")], outfile: join(dist, "content.js"), format: "iife" }),
  build({ ...shared, entryPoints: [join(root, "src/popup/popup.ts")], outfile: join(dist, "popup.js"), format: "iife" }),
  build({ ...shared, entryPoints: [join(root, "src/options/options.ts")], outfile: join(dist, "options.js"), format: "iife" }),
]);

await cp(join(root, "manifest.json"), join(dist, "manifest.json"));
await cp(join(root, "src/popup/popup.html"), join(dist, "popup.html"));
await cp(join(root, "src/popup/popup.css"), join(dist, "popup.css"));
await cp(join(root, "src/options/options.html"), join(dist, "options.html"));
await cp(join(root, "src/options/options.css"), join(dist, "options.css"));

// Icons are generated (see scripts/make-icons.mjs); regenerate if missing.
try {
  execFileSync(process.execPath, [join(root, "scripts/make-icons.mjs")], { stdio: "inherit" });
} catch (err) {
  console.warn("icon generation failed (non-fatal):", err.message);
}
await cp(join(root, "public/icons"), join(dist, "icons"), { recursive: true });

console.info("extension build complete → dist/");
