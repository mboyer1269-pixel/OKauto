import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, cpSync, existsSync } from 'fs';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/marketplace.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js';
          if (chunk.name === 'content') return 'content.js';
          return 'assets/[name]-[hash].js';
        },
      },
    },
  },
  plugins: [
    {
      name: 'copy-extension-assets',
      closeBundle() {
        copyFileSync('public/manifest.json', 'dist/manifest.json');
        if (existsSync('public/icons')) {
          mkdirSync('dist/icons', { recursive: true });
          cpSync('public/icons', 'dist/icons', { recursive: true });
        }
        // Fix popup path in manifest
        const popupHtml = resolve(__dirname, 'dist/src/popup/index.html');
        if (existsSync(popupHtml)) {
          mkdirSync('dist/popup', { recursive: true });
          cpSync(popupHtml, 'dist/popup/index.html');
        }
      },
    },
  ],
});
