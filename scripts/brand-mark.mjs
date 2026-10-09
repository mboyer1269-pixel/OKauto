/**
 * Rendu SVG du pictogramme Suivia à partir d’une spec (A, B ou C).
 * Source unique consommée par generate-brand-assets.mjs.
 */

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

export function svgMark(spec, size = "full") {
  const kind = spec.mark.kind;
  if (kind === "vin-bars") {
    return svgVinBars(spec, resolveBarCount(spec, size));
  }
  if (kind === "stroke-s") return svgStrokeS(spec, size);
  if (kind === "map-pin") return svgMapPin(spec);
  throw new Error(
    `generate-brand-assets: kind « ${kind} » non implémenté. Voir apps/web/src/brand/README.md.`,
  );
}

export function cssBrandTokens(spec) {
  const c = spec.colors;
  return `/* Généré par pnpm brand:assets — ne pas éditer à la main. Direction ${spec.id} « ${spec.name} ». */
:root {
  --brand-graphite: ${hexToHslChannels(c.ink)};
  --brand-ivory: ${hexToHslChannels(c.paper)};
  --brand-amber: ${hexToHslChannels(c.accent)};
  --brand-mark-bg: ${hexToHslChannels(c.markBg)};
  --brand-mark-fg: ${hexToHslChannels(c.markFg)};
}
`;
}

export { barLayout };
