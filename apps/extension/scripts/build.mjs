import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outdir = join(root, 'dist');
const watch = process.argv.includes('--watch');

mkdirSync(outdir, { recursive: true });
mkdirSync(join(outdir, 'icons'), { recursive: true });

// Minimal PNG placeholders (1x1 green) — replace with brand assets later
function tinyPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}
for (const size of [16, 48, 128]) {
  writeFileSync(join(outdir, 'icons', `icon${size}.png`), tinyPng());
}

cpSync(join(root, 'manifest.json'), join(outdir, 'manifest.json'));
for (const html of ['popup.html', 'sidepanel.html', 'options.html']) {
  cpSync(join(root, html), join(outdir, html));
}
cpSync(join(root, 'styles.css'), join(outdir, 'styles.css'));

const ctx = await esbuild.context({
  entryPoints: {
    background: join(root, 'src/background.ts'),
    content: join(root, 'src/content.ts'),
    popup: join(root, 'src/popup.ts'),
    sidepanel: join(root, 'src/sidepanel.ts'),
    options: join(root, 'src/options.ts'),
  },
  bundle: true,
  outdir,
  format: 'esm',
  target: ['chrome120'],
  sourcemap: true,
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
  console.log('watching extension…');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('extension built → dist/');
}
