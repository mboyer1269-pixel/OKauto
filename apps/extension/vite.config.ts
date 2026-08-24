import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, cpSync, existsSync, readFileSync, writeFileSync, rmSync } from 'fs';

export default defineConfig({
  // Relative paths required for Chrome extension popup assets
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/marketplace.ts'),
        appBridge: resolve(__dirname, 'src/content/app-bridge.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js';
          if (chunk.name === 'content') return 'content.js';
          if (chunk.name === 'appBridge') return 'app-bridge.js';
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

        // Move popup HTML to dist/popup/ with corrected relative asset paths
        const builtPopup = resolve(__dirname, 'dist/src/popup/index.html');
        if (existsSync(builtPopup)) {
          mkdirSync('dist/popup', { recursive: true });
          let html = readFileSync(builtPopup, 'utf-8');
          // dist/src/popup -> dist/popup: reduce path depth by one
          html = html.replace(/\.\.\/\.\.\/assets\//g, '../assets/');
          html = html.replace(/src="\/assets\//g, 'src="../assets/');
          writeFileSync('dist/popup/index.html', html);
          rmSync(resolve(__dirname, 'dist/src'), { recursive: true, force: true });
        }
      },
    },
  ],
});
