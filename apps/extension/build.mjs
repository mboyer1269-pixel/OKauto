import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

/**
 * Extension build: three isolated bundles (background ESM service worker,
 * content script IIFE, panel/popup IIFE) plus static assets. Bundles are
 * self-contained — content scripts cannot use module imports at runtime.
 */

const watch = process.argv.includes("--watch");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });

const common = {
  bundle: true,
  sourcemap: false,
  minify: false,
  target: "chrome120",
  logLevel: "info",
};

const builds = [
  { entryPoints: ["src/background.ts"], outfile: "dist/background.js", format: "esm", ...common },
  { entryPoints: ["src/content.ts"], outfile: "dist/content.js", format: "iife", ...common },
  { entryPoints: ["src/panel.ts"], outfile: "dist/panel.js", format: "iife", ...common },
  { entryPoints: ["src/popup.ts"], outfile: "dist/popup.js", format: "iife", ...common },
];

if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("Watching extension sources…");
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  console.log("Extension built to dist/. Load it via chrome://extensions → Load unpacked.");
}
