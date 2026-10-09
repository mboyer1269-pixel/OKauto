/**
 * Génère favicon, icônes d’extension, jetons CSS et image Open Graph
 * à partir de apps/web/src/brand/spec.json — unique source de la marque.
 *
 * Usage : pnpm brand:assets
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  barLayout,
  cssBrandTokens,
  hexToRgb,
  resolveBarCount,
  svgMark,
} from "./brand-mark.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = join(root, "apps/web/src/brand/spec.json");
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const view = spec.mark.viewBox;

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const payload = Buffer.concat([t, data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(payload));
  return Buffer.concat([len, payload, c]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[stride * y] = 0;
    rgba.copy(raw, stride * y + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function parseHex(hex) {
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b, 255];
}

function setPixel(buf, w, x, y, color) {
  if (x < 0 || y < 0 || x >= w || y >= buf.length / 4 / w) return;
  const i = (Math.floor(y) * w + Math.floor(x)) * 4;
  buf[i] = color[0];
  buf[i + 1] = color[1];
  buf[i + 2] = color[2];
  buf[i + 3] = color[3];
}

function insideRoundedRect(px, py, x, y, w, h, r) {
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  if (px >= x + r && px <= x + w - r && py >= y && py <= y + h) return true;
  if (py >= y + r && py <= y + h - r && px >= x && px <= x + w) return true;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function fillRoundedRect(buf, width, height, x, y, w, h, r, color) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(width, Math.ceil(x + w));
  const y1 = Math.min(height, Math.ceil(y + h));
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      if (insideRoundedRect(px + 0.5, py + 0.5, x, y, w, h, r)) {
        setPixel(buf, width, px, py, color);
      }
    }
  }
}

function fillCircle(buf, width, cx, cy, r, color) {
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(width, Math.ceil(cx + r));
  const y1 = Math.min(buf.length / 4 / width, Math.ceil(cy + r));
  const r2 = r * r;
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const dx = px + 0.5 - cx;
      const dy = py + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) setPixel(buf, width, px, py, color);
    }
  }
}

function pointInTriangle(px, py, a, b, c) {
  const s = (a[0] - c[0]) * (py - c[1]) - (a[1] - c[1]) * (px - c[0]);
  const t = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
  if (s < 0 !== t < 0 && s !== 0 && t !== 0) return false;
  const d = (c[0] - b[0]) * (py - b[1]) - (c[1] - b[1]) * (px - b[0]);
  return d === 0 || d < 0 === s + t <= 0;
}

function fillTriangle(buf, width, a, b, c, color) {
  const xs = [a[0], b[0], c[0]];
  const ys = [a[1], b[1], c[1]];
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(width, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(buf.length / 4 / width, Math.ceil(Math.max(...ys)));
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      if (pointInTriangle(px + 0.5, py + 0.5, a, b, c)) {
        setPixel(buf, width, px, py, color);
      }
    }
  }
}

function cubicPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

function samplePath(d) {
  const tokens = d.match(/[MC]|-?\d*\.?\d+/g) ?? [];
  const points = [];
  let i = 0;
  let current = [0, 0];
  while (i < tokens.length) {
    const cmd = tokens[i];
    if (cmd === "M") {
      current = [Number(tokens[i + 1]), Number(tokens[i + 2])];
      points.push(current);
      i += 3;
    } else if (cmd === "C") {
      const p1 = [Number(tokens[i + 1]), Number(tokens[i + 2])];
      const p2 = [Number(tokens[i + 3]), Number(tokens[i + 4])];
      const p3 = [Number(tokens[i + 5]), Number(tokens[i + 6])];
      for (let s = 1; s <= 12; s += 1) {
        points.push(cubicPoint(current, p1, p2, p3, s / 12));
      }
      current = p3;
      i += 7;
    } else {
      i += 1;
    }
  }
  return points;
}

function paintBackground(buf, size) {
  const bg = parseHex(spec.colors.markBg);
  fillRoundedRect(
    buf,
    size,
    size,
    0,
    0,
    size,
    size,
    size * spec.mark.iconRadiusRatio,
    bg,
  );
}

function rasterVinBars(size, count) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / view;
  const fg = parseHex(spec.colors.markFg);
  paintBackground(buf, size);
  for (const bar of barLayout(spec, count)) {
    fillRoundedRect(
      buf,
      size,
      size,
      bar.x * scale,
      bar.y * scale,
      bar.w * scale,
      bar.h * scale,
      Math.max(0.6, bar.rx * scale),
      fg,
    );
  }
  return buf;
}

function rasterStrokeS(size, includeNode) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / view;
  const fg = parseHex(spec.colors.markFg);
  const accent = parseHex(spec.colors.accent);
  paintBackground(buf, size);
  const radius = Math.max(0.8, (spec.mark.strokeWidth / 2) * scale);
  for (const [x, y] of samplePath(spec.mark.path)) {
    fillCircle(buf, size, x * scale, y * scale, radius, fg);
  }
  if (includeNode && spec.mark.node) {
    fillCircle(
      buf,
      size,
      spec.mark.node.cx * scale,
      spec.mark.node.cy * scale,
      spec.mark.node.r * scale,
      accent,
    );
  }
  return buf;
}

function rasterMapPin(size) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / view;
  const fg = parseHex(spec.colors.markFg);
  const bg = parseHex(spec.colors.markBg);
  const accent = parseHex(spec.colors.accent);
  paintBackground(buf, size);
  const { pinHead, pinTip, hole, badge } = spec.mark;
  fillCircle(buf, size, pinHead.cx * scale, pinHead.cy * scale, pinHead.r * scale, fg);
  fillTriangle(
    buf,
    size,
    pinTip[0].map((n) => n * scale),
    pinTip[1].map((n) => n * scale),
    pinTip[2].map((n) => n * scale),
    fg,
  );
  fillCircle(buf, size, hole.cx * scale, hole.cy * scale, hole.r * scale, bg);
  fillCircle(buf, size, badge.cx * scale, badge.cy * scale, badge.r * scale, accent);
  return buf;
}

function rasterMark(size, sizeName) {
  const kind = spec.mark.kind;
  if (kind === "vin-bars") return rasterVinBars(size, resolveBarCount(spec, sizeName));
  if (kind === "stroke-s") return rasterStrokeS(size, sizeName !== "small");
  if (kind === "map-pin") return rasterMapPin(size);
  throw new Error(`kind « ${kind} » non implémenté pour le raster PNG.`);
}

function drawLockup(width, height) {
  const buf = Buffer.alloc(width * height * 4);
  const ink = parseHex(spec.colors.ink);
  const paper = parseHex(spec.colors.paper);
  const accent = parseHex(spec.colors.accent);
  for (let i = 0; i < width * height; i += 1) {
    buf[i * 4] = ink[0];
    buf[i * 4 + 1] = ink[1];
    buf[i * 4 + 2] = ink[2];
    buf[i * 4 + 3] = 255;
  }
  const markSize = Math.round(height * 0.42);
  const mark = rasterMark(markSize, "full");
  const mx = Math.round(width * 0.1);
  const my = Math.round((height - markSize) / 2);
  for (let y = 0; y < markSize; y += 1) {
    for (let x = 0; x < markSize; x += 1) {
      const src = (y * markSize + x) * 4;
      setPixel(buf, width, mx + x, my + y, [
        mark[src],
        mark[src + 1],
        mark[src + 2],
        mark[src + 3],
      ]);
    }
  }
  const word = spec.wordmark;
  const glyphW = Math.round(width * 0.028);
  const glyphH = Math.round(height * 0.11);
  const textX = mx + markSize + Math.round(width * 0.04);
  const textY = Math.round(height * 0.42);
  for (let i = 0; i < word.length; i += 1) {
    fillRoundedRect(
      buf,
      width,
      height,
      textX + i * (glyphW + Math.round(glyphW * 0.35)),
      textY,
      glyphW,
      glyphH,
      2,
      paper,
    );
  }
  fillRoundedRect(
    buf,
    width,
    height,
    textX,
    textY + glyphH + Math.round(height * 0.04),
    Math.round(width * 0.08),
    Math.round(height * 0.012),
    1,
    accent,
  );
  return buf;
}

const webBrand = join(root, "apps/web/src/brand");
const generated = join(webBrand, "generated");
const webApp = join(root, "apps/web/src/app");
const extIcons = join(root, "apps/extension/public/icons");
mkdirSync(webBrand, { recursive: true });
mkdirSync(generated, { recursive: true });
mkdirSync(webApp, { recursive: true });
mkdirSync(extIcons, { recursive: true });

const fullSvg = svgMark(spec, "full");
const mediumSvg = svgMark(spec, "medium");
const smallSvg = svgMark(spec, "small");

writeFileSync(join(webBrand, "mark.svg"), fullSvg);
writeFileSync(join(webBrand, "mark-simple.svg"), mediumSvg);
writeFileSync(join(webApp, "icon.svg"), smallSvg);
writeFileSync(join(generated, "tokens.css"), cssBrandTokens(spec));

const icons = [
  [join(extIcons, "icon16.png"), 16, "small"],
  [join(extIcons, "icon48.png"), 48, "medium"],
  [join(extIcons, "icon128.png"), 128, "full"],
  [join(webApp, "apple-icon.png"), 180, "full"],
];
for (const [path, size, sizeName] of icons) {
  writeFileSync(path, encodePng(size, size, rasterMark(size, sizeName)));
}

writeFileSync(
  join(webApp, "opengraph-image.png"),
  encodePng(1200, 630, drawLockup(1200, 630)),
);

const popupPath = join(root, "apps/extension/src/popup/index.html");
const popup = readFileSync(popupPath, "utf8");
const inlineMark = mediumSvg
  .replace('role="img" aria-label="Suivia"', 'aria-hidden="true"')
  .replace(/\n/g, "\n      ")
  .trim();
if (!popup.includes("<!-- brand-mark -->")) {
  throw new Error("Marqueur <!-- brand-mark --> absent du popup.");
}
writeFileSync(
  popupPath,
  popup.replace(
    /<!-- brand-mark -->[\s\S]*?<!-- \/brand-mark -->/,
    `<!-- brand-mark -->\n      ${inlineMark}\n      <!-- /brand-mark -->`,
  ),
);

console.log("Marque générée depuis", spec.id, spec.name);
console.log(" -", join(webBrand, "mark.svg"));
console.log(" -", join(generated, "tokens.css"));
console.log(" - icônes 16/48/128 + apple-icon + opengraph-image");
