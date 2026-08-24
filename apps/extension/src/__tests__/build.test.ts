import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const dist = resolve(__dirname, '../../dist');
const hasDist = existsSync(resolve(dist, 'manifest.json'));

describe.skipIf(!hasDist)('extension build output', () => {

  it('has manifest.json', () => {
    expect(existsSync(resolve(dist, 'manifest.json'))).toBe(true);
  });

  it('has popup with relative asset paths', () => {
    const popupPath = resolve(dist, 'popup/index.html');
    expect(existsSync(popupPath)).toBe(true);
    const html = readFileSync(popupPath, 'utf-8');
    expect(html).toMatch(/src="\.\.\/assets\//);
    expect(html).not.toMatch(/src="\/assets\//);
  });

  it('has background and content scripts', () => {
    expect(existsSync(resolve(dist, 'background.js'))).toBe(true);
    expect(existsSync(resolve(dist, 'content.js'))).toBe(true);
    expect(existsSync(resolve(dist, 'app-bridge.js'))).toBe(true);
  });

  it('keeps manifest content scripts self-contained', () => {
    const content = readFileSync(resolve(dist, 'content.js'), 'utf-8');
    const appBridge = readFileSync(resolve(dist, 'app-bridge.js'), 'utf-8');

    expect(content).not.toMatch(/^\s*import\s/m);
    expect(appBridge).not.toMatch(/^\s*import\s/m);
  });
});
