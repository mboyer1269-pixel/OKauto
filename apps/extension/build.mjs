// Build script for the OKauto MV3 extension. Bundles each entry into a single,
// self-contained IIFE file (required for content scripts), copies static assets.
import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(__dirname, 'dist');
const watch = process.argv.includes('--watch');

const entryPoints = {
  background: resolve(__dirname, 'src/background.ts'),
  content: resolve(__dirname, 'src/content.ts'),
  popup: resolve(__dirname, 'src/popup.ts'),
  options: resolve(__dirname, 'src/options.ts'),
};

const options = {
  entryPoints,
  outdir,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome110',
  sourcemap: true,
  logLevel: 'info',
};

async function copyStatic() {
  await cp(resolve(__dirname, 'public'), outdir, { recursive: true });
  await cp(resolve(__dirname, 'manifest.json'), resolve(outdir, 'manifest.json'));
}

async function run() {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await copyStatic();
  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log('Watching for changes…');
  } else {
    await build(options);
    console.log('Extension built to dist/');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
