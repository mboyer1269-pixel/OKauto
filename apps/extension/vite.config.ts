import { defineConfig, build as viteBuild } from 'vite';
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
      async closeBundle() {
        // Chrome content scripts cannot use ES imports: rebuild each one as a
        // single self-contained IIFE file so no shared chunk is imported.
        if (!process.env.OKAUTO_CONTENT_IIFE) {
          process.env.OKAUTO_CONTENT_IIFE = '1';
          for (const [name, entry] of [
            ['content', 'src/content/marketplace.ts'],
            ['app-bridge', 'src/content/app-bridge.ts'],
          ] as const) {
            await viteBuild({
              configFile: false,
              logLevel: 'warn',
              build: {
                outDir: 'dist',
                emptyOutDir: false,
                lib: { entry: resolve(__dirname, entry), formats: ['iife'], name: name.replace('-', '_'), fileName: () => `${name}.js` },
              },
            });
          }
        }
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
