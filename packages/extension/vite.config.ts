import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

function copyManifest() {
  return {
    name: "copy-manifest",
    closeBundle() {
      mkdirSync(resolve(rootDir, "dist"), { recursive: true });
      copyFileSync(resolve(rootDir, "manifest.json"), resolve(rootDir, "dist/manifest.json"));
    }
  };
}

export default defineConfig({
  plugins: [react(), copyManifest()],
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      input: {
        background: resolve(rootDir, "src/background.ts"),
        content: resolve(rootDir, "src/content.ts"),
        popup: resolve(rootDir, "popup.html"),
        sidepanel: resolve(rootDir, "sidepanel.html")
      },
      output: {
        assetFileNames: "assets/[name][extname]",
        chunkFileNames: "assets/[name].js",
        entryFileNames: "assets/[name].js"
      }
    }
  }
});
