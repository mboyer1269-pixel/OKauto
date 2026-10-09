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
  layoutHatchedIcon,
  layoutWordmark,
  resolveBarCount,
  svgMark,
  svgWordmark,
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

function lerpColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    255,
  ];
}

function pointInPoly(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function partContains(part, px, py) {
  if (part.type === "rect") {
    return insideRoundedRect(px, py, part.x, part.y, part.w, part.h, 2.2);
  }
  if (part.type === "poly") return pointInPoly(px, py, part.points);
  const inOuter = insideRoundedRect(
    px,
    py,
    part.x,
    part.y,
    part.w,
    part.h,
    part.rx,
  );
  const inInner = insideRoundedRect(
    px,
    py,
    part.ix,
    part.iy,
    part.iw,
    part.ih,
    part.irx,
  );
  return inOuter && !inInner;
}

function paintHatched(buf, width, height, parts, from, to, pitch, bar) {
  for (const part of parts) {
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    if (part.type === "rect" || part.type === "ring") {
      x0 = Math.floor(part.x);
      y0 = Math.floor(part.y);
      x1 = Math.ceil(part.x + part.w);
      y1 = Math.ceil(part.y + part.h);
    } else {
      x0 = Math.floor(Math.min(...part.points.map((p) => p[0])));
      y0 = Math.floor(Math.min(...part.points.map((p) => p[1])));
      x1 = Math.ceil(Math.max(...part.points.map((p) => p[0])));
      y1 = Math.ceil(Math.max(...part.points.map((p) => p[1])));
    }
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(width, x1);
    y1 = Math.min(height, y1);
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) {
        if (!partContains(part, px + 0.5, py + 0.5)) continue;
        if ((px + 0.5) % pitch > bar) continue;
        const t = width <= 1 ? 0 : px / (width - 1);
        setPixel(buf, width, px, py, lerpColor(from, to, t));
      }
    }
  }
}

function rasterHatchedS(size, sizeName) {
  const buf = Buffer.alloc(size * size * 4);
  paintBackground(buf, size);
  const pitch = sizeName === "small" ? Math.max(2.2, size * 0.12) : size * 0.08;
  const bar = pitch * 0.64;
  const scale = size / view;
  const parts = layoutHatchedIcon(view).map((part) => {
    if (part.type === "rect") {
      return {
        type: "rect",
        x: part.x * scale,
        y: part.y * scale,
        w: part.w * scale,
        h: part.h * scale,
      };
    }
    if (part.type === "poly") {
      return {
        type: "poly",
        points: part.points.map(([x, y]) => [x * scale, y * scale]),
      };
    }
    return {
      type: "ring",
      x: part.x * scale,
      y: part.y * scale,
      w: part.w * scale,
      h: part.h * scale,
      ix: part.ix * scale,
      iy: part.iy * scale,
      iw: part.iw * scale,
      ih: part.ih * scale,
      rx: part.rx * scale,
      irx: part.irx * scale,
    };
  });
  paintHatched(
    buf,
    size,
    size,
    parts,
    parseHex(spec.colors.gradientFrom),
    parseHex(spec.colors.gradientTo),
    pitch,
    bar,
  );
  return buf;
}

function rasterMark(size, sizeName) {
  const kind = spec.mark.kind;
  if (kind === "vin-bars") return rasterVinBars(size, resolveBarCount(spec, sizeName));
  if (kind === "stroke-s") return rasterStrokeS(size, sizeName !== "small");
  if (kind === "map-pin") return rasterMapPin(size);
  if (kind === "hatched-s") return rasterHatchedS(size, sizeName);
  throw new Error(`kind « ${kind} » non implémenté pour le raster PNG.`);
}

function drawLockup(width, height) {
  const buf = Buffer.alloc(width * height * 4);
  const ink = parseHex(spec.colors.ink);
  const paper = parseHex(spec.colors.paper);
  const accent = parseHex(spec.colors.accent);
  const bg = spec.mark.kind === "hatched-s" ? paper : ink;
  for (let i = 0; i < width * height; i += 1) {
    buf[i * 4] = bg[0];
    buf[i * 4 + 1] = bg[1];
    buf[i * 4 + 2] = bg[2];
    buf[i * 4 + 3] = 255;
  }
  if (spec.mark.kind === "hatched-s") {
    const layout = layoutWordmark(spec);
    const scale = Math.min((width * 0.82) / layout.width, (height * 0.5) / layout.height);
    const ox = (width - layout.width * scale) / 2;
    const oy = (height - layout.height * scale) / 2;
    const parts = layout.parts.map((part) => {
      if (part.type === "rect") {
        return {
          type: "rect",
          x: ox + part.x * scale,
          y: oy + part.y * scale,
          w: part.w * scale,
          h: part.h * scale,
        };
      }
      if (part.type === "poly") {
        return {
          type: "poly",
          points: part.points.map(([x, y]) => [ox + x * scale, oy + y * scale]),
        };
      }
      return {
        type: "ring",
        x: ox + part.x * scale,
        y: oy + part.y * scale,
        w: part.w * scale,
        h: part.h * scale,
        ix: ox + part.ix * scale,
        iy: oy + part.iy * scale,
        iw: part.iw * scale,
        ih: part.ih * scale,
        rx: part.rx * scale,
        irx: part.irx * scale,
      };
    });
    paintHatched(
      buf,
      width,
      height,
      parts,
      parseHex(spec.colors.gradientFrom),
      parseHex(spec.colors.gradientTo),
      8,
      5.2,
    );
    return buf;
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
if (spec.mark.kind === "hatched-s") {
  writeFileSync(join(webBrand, "wordmark.svg"), svgWordmark(spec));
}

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
