import * as esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    popup: "src/popup.ts",
  },
  bundle: true,
  format: "iife",
  target: "chrome110",
  outdir: "dist",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info",
};

mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("watching…");
} else {
  await esbuild.build(options);
}
