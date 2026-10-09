/**
 * Rendu SVG du pictogramme Suivia à partir d’une spec (A, B, C ou D).
 * Source unique consommée par generate-brand-assets.mjs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const letterforms = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../apps/web/src/brand/letterforms.json",
    ),
    "utf8",
  ),
);

export function hexToRgb(hex) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToHslChannels(hex) {
  const [r0, g0, b0] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r0, g0, b0);
  const min = Math.min(r0, g0, b0);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r0) h = (g0 - b0) / d + (g0 < b0 ? 6 : 0);
    else if (max === g0) h = (b0 - r0) / d + 2;
    else h = (r0 - g0) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function barLayout(spec, count) {
  const bars = spec.bars[String(count)];
  if (!bars) throw new Error(`Pas de barres pour count=${count}`);
  const { viewBox, pad, barUnit, gapRatio, radius } = spec.mark;
  const n = bars.length;
  const totalUnits = n * barUnit + (n - 1) * gapRatio;
  const inner = viewBox - 2 * pad;
  const scale = inner / totalUnits;
  const barW = barUnit * scale;
  const gap = gapRatio * scale;
  const rx = radius * scale;
  let x = pad;
  return bars.map((bar) => {
    const rect = { x, y: bar.y, w: barW, h: bar.h, rx };
    x += barW + gap;
    return rect;
  });
}

function svgFrame(spec, inner, label) {
  const view = spec.mark.viewBox;
  const radius = view * spec.mark.iconRadiusRatio;
  const aria = label
    ? ` role="img" aria-label="${spec.ariaLabel}"`
    : ` aria-hidden="true"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" fill="none"${aria}>
  <rect width="${view}" height="${view}" rx="${radius.toFixed(2)}" fill="${spec.colors.markBg}"/>
  ${inner}
</svg>
`;
}

function svgVinBars(spec, count) {
  const rects = barLayout(spec, count)
    .map(
      (b) =>
        `<rect x="${b.x.toFixed(3)}" y="${b.y}" width="${b.w.toFixed(3)}" height="${b.h}" rx="${b.rx.toFixed(3)}" fill="${spec.colors.markFg}"/>`,
    )
    .join("");
  return svgFrame(spec, rects, true);
}

function svgStrokeS(spec, size) {
  const { path, strokeWidth, node } = spec.mark;
  const nodeEl =
    size === "small" || !node
      ? ""
      : `<circle cx="${node.cx}" cy="${node.cy}" r="${node.r}" fill="${spec.colors.accent}"/>`;
  const inner = `<path d="${path}" stroke="${spec.colors.markFg}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>${nodeEl}`;
  return svgFrame(spec, inner, true);
}

function svgMapPin(spec) {
  const { pinHead, pinTip, hole, badge } = spec.mark;
  const points = pinTip.map((p) => p.join(",")).join(" ");
  const inner = `<circle cx="${pinHead.cx}" cy="${pinHead.cy}" r="${pinHead.r}" fill="${spec.colors.markFg}"/>
  <polygon points="${points}" fill="${spec.colors.markFg}"/>
  <circle cx="${hole.cx}" cy="${hole.cy}" r="${hole.r}" fill="${spec.colors.markBg}"/>
  <circle cx="${badge.cx}" cy="${badge.cy}" r="${badge.r}" fill="${spec.colors.accent}"/>`;
  return svgFrame(spec, inner, true);
}

export function resolveBarCount(spec, size) {
  if (spec.mark.kind !== "vin-bars") return null;
  if (size === "small") return spec.mark.smallBarCount;
  if (size === "medium") return spec.mark.mediumBarCount;
  return spec.mark.fullBarCount;
}

function scalePart(part, ox, oy, s) {
  const kind = part[0];
  if (kind === "rect") {
    return { type: "rect", x: ox + part[1] * s, y: oy + part[2] * s, w: part[3] * s, h: part[4] * s };
  }
  if (kind === "poly") {
    return {
      type: "poly",
      points: part[1].map(([x, y]) => [ox + x * s, oy + y * s]),
    };
  }
  return {
    type: "ring",
    x: ox + part[1] * s,
    y: oy + part[2] * s,
    w: part[3] * s,
    h: part[4] * s,
    ix: ox + part[5] * s,
    iy: oy + part[6] * s,
    iw: part[7] * s,
    ih: part[8] * s,
    rx: part[9] * s,
    irx: part[10] * s,
  };
}

function roundedRectPath(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  return `M ${x + radius} ${y} H ${x + w - radius} A ${radius} ${radius} 0 0 1 ${x + w} ${y + radius} V ${y + h - radius} A ${radius} ${radius} 0 0 1 ${x + w - radius} ${y + h} H ${x + radius} A ${radius} ${radius} 0 0 1 ${x} ${y + h - radius} V ${y + radius} A ${radius} ${radius} 0 0 1 ${x + radius} ${y} Z`;
}

function partToPath(part) {
  if (part.type === "rect") return roundedRectPath(part.x, part.y, part.w, part.h, 2.2);
  if (part.type === "poly") return `M ${part.points.map((p) => p.join(" ")).join(" L ")} Z`;
  return `${roundedRectPath(part.x, part.y, part.w, part.h, part.rx)} ${roundedRectPath(part.ix, part.iy, part.iw, part.ih, part.irx)}`;
}

export function layoutWordmark(spec) {
  const view = spec.wordmarkView;
  const s = view.letterHeight / letterforms.em;
  let x = view.pad;
  const parts = [];
  for (const ch of view.sequence) {
    if (ch === " ") {
      x += view.space;
      continue;
    }
    const glyph = letterforms.letters[ch];
    if (!glyph) throw new Error(`Lettre inconnue : ${ch}`);
    for (const part of glyph.parts) parts.push(scalePart(part, x, view.y, s));
    x += glyph.width * s + view.gap;
  }
  if (view.arrow) {
    x += view.gap * 0.4;
    for (const part of letterforms.arrow.parts) {
      parts.push(scalePart(part, x, view.y, s));
    }
  }
  return { width: view.width, height: view.height, parts };
}

export function layoutHatchedIcon(viewBox = 40) {
  const sS = (viewBox * 0.62) / letterforms.em;
  const sA = (viewBox * 0.42) / letterforms.em;
  const sParts = letterforms.letters.S.parts.map((part) =>
    scalePart(part, viewBox * 0.1, viewBox * 0.08, sS),
  );
  const aParts = letterforms.arrow.parts.map((part) =>
    scalePart(part, viewBox * 0.58, viewBox * 0.28, sA),
  );
  return [...sParts, ...aParts];
}

function hatchSvg({
  width,
  height,
  parts,
  from,
  to,
  pitch,
  bar,
  label,
  background,
  radius = 0,
}) {
  const paths = parts
    .map((part) => `<path d="${partToPath(part)}" />`)
    .join("\n    ");
  const aria = label
    ? ` role="img" aria-label="${label}"`
    : ` aria-hidden="true"`;
  const bg = background
    ? `<rect width="${width}" height="${height}" rx="${radius.toFixed(2)}" fill="${background}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none"${aria}>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
    <pattern id="h" width="${pitch}" height="${height}" patternUnits="userSpaceOnUse">
      <rect width="${bar}" height="${height}" fill="#fff"/>
    </pattern>
    <mask id="m"><rect width="${width}" height="${height}" fill="url(#h)"/></mask>
    <clipPath id="c" clip-rule="evenodd">
    ${paths}
    </clipPath>
  </defs>
  ${bg}
  <g clip-path="url(#c)">
    <rect width="${width}" height="${height}" fill="url(#g)" mask="url(#m)"/>
  </g>
</svg>
`;
}

function svgHatchedS(spec, size) {
  const view = spec.mark.viewBox;
  const pitch = size === "small" ? 4.2 : spec.mark.hatchPitch;
  const bar = size === "small" ? 2.8 : spec.mark.hatchBar;
  return hatchSvg({
    width: view,
    height: view,
    parts: layoutHatchedIcon(view),
    from: spec.colors.gradientFrom,
    to: spec.colors.gradientTo,
    pitch,
    bar,
    label: spec.ariaLabel,
    background: spec.colors.markBg,
    radius: view * spec.mark.iconRadiusRatio,
  });
}

export function svgWordmark(spec, { inverted = false } = {}) {
  const { width, height, parts } = layoutWordmark(spec);
  const from = inverted ? spec.colors.gradientFromOnDark : spec.colors.gradientFrom;
  const to = inverted ? spec.colors.gradientToOnDark : spec.colors.gradientTo;
  return hatchSvg({
    width,
    height,
    parts,
    from,
    to,
    pitch: spec.wordmarkView.hatchPitch,
    bar: spec.wordmarkView.hatchBar,
    label: spec.lockup || spec.ariaLabel,
  });
}

export function svgMark(spec, size = "full") {
  const kind = spec.mark.kind;
  if (kind === "vin-bars") {
    return svgVinBars(spec, resolveBarCount(spec, size));
  }
  if (kind === "stroke-s") return svgStrokeS(spec, size);
  if (kind === "map-pin") return svgMapPin(spec);
  if (kind === "hatched-s") return svgHatchedS(spec, size);
  throw new Error(
    `generate-brand-assets: kind « ${kind} » non implémenté. Voir apps/web/src/brand/README.md.`,
  );
}

export function cssBrandTokens(spec) {
  const c = spec.colors;
  const navy = c.navy ?? c.ink;
  const cyan = c.cyan ?? c.accent;
  return `/* Généré par pnpm brand:assets — ne pas éditer à la main. Direction ${spec.id} « ${spec.name} ». */
:root {
  --brand-graphite: ${hexToHslChannels(c.ink)};
  --brand-ivory: ${hexToHslChannels(c.paper)};
  --brand-amber: ${hexToHslChannels(c.accent)};
  --brand-navy: ${hexToHslChannels(navy)};
  --brand-cyan: ${hexToHslChannels(cyan)};
  --brand-mark-bg: ${hexToHslChannels(c.markBg)};
  --brand-mark-fg: ${hexToHslChannels(c.markFg)};
  --sidebar-accent: ${hexToHslChannels(cyan)};
}
`;
}

export { barLayout };
