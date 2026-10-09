/**
 * Génère favicon, icônes d’extension et image Open Graph
 * à partir de apps/web/src/brand/spec.json — unique source de la marque.
 *
 * Usage : pnpm brand:assets
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = join(root, "apps/web/src/brand/spec.json");
const spec = JSON.parse(readFileSync(specPath, "utf8"));

if (spec.mark.kind !== "vin-bars") {
  throw new Error(
    `generate-brand-assets: kind « ${spec.mark.kind} » non implémenté. Ajoutez un renderer avant de changer de direction.`,
  );
}

const view = spec.mark.viewBox;

function barLayout(count) {
  const bars = spec.bars[String(count)];
  if (!bars) throw new Error(`Pas de barres pour count=${count}`);
  const pad = spec.mark.pad;
  const totalUnits = count * spec.mark.barUnit + (count - 1) * spec.mark.gapRatio;
  const inner = view - 2 * pad;
  const scale = inner / totalUnits;
  const barW = spec.mark.barUnit * scale;
  const gap = spec.mark.gapRatio * scale;
  const rx = spec.mark.radius * scale;
  let x = pad;
  return bars.map((bar) => {
    const rect = { x, y: bar.y, w: barW, h: bar.h, rx };
    x += barW + gap;
    return rect;
  });
}

function svgMark(count) {
  const radius = view * spec.mark.iconRadiusRatio;
  const rects = barLayout(count)
    .map(
      (b) =>
        `<rect x="${b.x.toFixed(3)}" y="${b.y}" width="${b.w.toFixed(3)}" height="${b.h}" rx="${b.rx.toFixed(3)}" fill="${spec.colors.amber}"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" fill="none" role="img" aria-label="${spec.ariaLabel}">
  <rect width="${view}" height="${view}" rx="${radius.toFixed(2)}" fill="${spec.colors.graphite}"/>
  ${rects}
</svg>
`;
}

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
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
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

function rasterMark(size, count) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / view;
  const graphite = parseHex(spec.colors.graphite);
  const amber = parseHex(spec.colors.amber);
  fillRoundedRect(
    buf,
    size,
    size,
    0,
    0,
    size,
    size,
    size * spec.mark.iconRadiusRatio,
    graphite,
  );
  for (const bar of barLayout(count)) {
    fillRoundedRect(
      buf,
      size,
      size,
      bar.x * scale,
      bar.y * scale,
      bar.w * scale,
      bar.h * scale,
      Math.max(0.6, bar.rx * scale),
      amber,
    );
  }
  return buf;
}

function drawLockup(width, height) {
  const buf = Buffer.alloc(width * height * 4);
  const graphite = parseHex(spec.colors.graphite);
  const ivory = parseHex(spec.colors.ivory);
  const amber = parseHex(spec.colors.amber);
  buf.fill(0);
  for (let i = 0; i < width * height; i += 1) {
    buf[i * 4] = graphite[0];
    buf[i * 4 + 1] = graphite[1];
    buf[i * 4 + 2] = graphite[2];
    buf[i * 4 + 3] = 255;
  }
  const markSize = Math.round(height * 0.42);
  const mark = rasterMark(markSize, spec.mark.fullBarCount);
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
      ivory,
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
    amber,
  );
  return buf;
}

const webBrand = join(root, "apps/web/src/brand");
const webApp = join(root, "apps/web/src/app");
const extIcons = join(root, "apps/extension/public/icons");
mkdirSync(webBrand, { recursive: true });
mkdirSync(webApp, { recursive: true });
mkdirSync(extIcons, { recursive: true });

writeFileSync(join(webBrand, "mark.svg"), svgMark(spec.mark.fullBarCount));
writeFileSync(join(webBrand, "mark-simple.svg"), svgMark(spec.mark.mediumBarCount));
writeFileSync(join(webApp, "icon.svg"), svgMark(spec.mark.smallBarCount));

const icons = [
  [join(extIcons, "icon16.png"), 16, spec.mark.smallBarCount],
  [join(extIcons, "icon48.png"), 48, spec.mark.mediumBarCount],
  [join(extIcons, "icon128.png"), 128, spec.mark.fullBarCount],
  [join(webApp, "apple-icon.png"), 180, spec.mark.fullBarCount],
];
for (const [path, size, count] of icons) {
  writeFileSync(path, encodePng(size, size, rasterMark(size, count)));
}

writeFileSync(
  join(webApp, "opengraph-image.png"),
  encodePng(1200, 630, drawLockup(1200, 630)),
);

const popupPath = join(root, "apps/extension/src/popup/index.html");
const popup = readFileSync(popupPath, "utf8");
const inlineMark = svgMark(spec.mark.mediumBarCount)
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
console.log(" -", join(webApp, "icon.svg"));
console.log(" - icônes 16/48/128 + apple-icon + opengraph-image");
