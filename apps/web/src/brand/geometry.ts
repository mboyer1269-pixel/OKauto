import letterforms from "./letterforms.json";
import type { BrandSpec } from "./types";

export type HatchPart =
  | { type: "rect"; x: number; y: number; w: number; h: number }
  | { type: "poly"; points: Array<[number, number]> }
  | {
      type: "ring";
      x: number;
      y: number;
      w: number;
      h: number;
      ix: number;
      iy: number;
      iw: number;
      ih: number;
      rx: number;
      irx: number;
    };

type RawPart = unknown[];

function scalePart(part: RawPart, ox: number, oy: number, s: number): HatchPart {
  const kind = part[0];
  if (kind === "rect") {
    const x = Number(part[1]);
    const y = Number(part[2]);
    const w = Number(part[3]);
    const h = Number(part[4]);
    return { type: "rect", x: ox + x * s, y: oy + y * s, w: w * s, h: h * s };
  }
  if (kind === "poly") {
    const pts = part[1] as Array<[number, number]>;
    return {
      type: "poly",
      points: pts.map(([x, y]) => [ox + x * s, oy + y * s]),
    };
  }
  const x = Number(part[1]);
  const y = Number(part[2]);
  const w = Number(part[3]);
  const h = Number(part[4]);
  const ix = Number(part[5]);
  const iy = Number(part[6]);
  const iw = Number(part[7]);
  const ih = Number(part[8]);
  const rx = Number(part[9]);
  const irx = Number(part[10]);
  return {
    type: "ring",
    x: ox + x * s,
    y: oy + y * s,
    w: w * s,
    h: h * s,
    ix: ox + ix * s,
    iy: oy + iy * s,
    iw: iw * s,
    ih: ih * s,
    rx: rx * s,
    irx: irx * s,
  };
}

export function layoutWordmark(spec: BrandSpec): {
  width: number;
  height: number;
  parts: HatchPart[];
} {
  const view = spec.wordmarkView;
  if (!view) {
    throw new Error("layoutWordmark: wordmarkView absent de la spec.");
  }
  const s = view.letterHeight / letterforms.em;
  let x = view.pad;
  const parts: HatchPart[] = [];
  for (const ch of view.sequence) {
    if (ch === " ") {
      x += view.space;
      continue;
    }
    const glyph = letterforms.letters[ch as keyof typeof letterforms.letters];
    if (!glyph) throw new Error(`Lettre inconnue : ${ch}`);
    for (const part of glyph.parts) {
      parts.push(scalePart(part as RawPart, x, view.y, s));
    }
    x += glyph.width * s + view.gap;
  }
  if (view.arrow) {
    x += view.gap * 0.4;
    for (const part of letterforms.arrow.parts) {
      parts.push(scalePart(part as RawPart, x, view.y, s));
    }
    x += letterforms.arrow.width * s;
  }
  return { width: view.width, height: view.height, parts };
}

export function layoutHatchedS(viewBox = 40): HatchPart[] {
  const s = (viewBox * 0.62) / letterforms.em;
  const ox = viewBox * 0.1;
  const oy = viewBox * 0.08;
  return letterforms.letters.S.parts.map((part) =>
    scalePart(part as RawPart, ox, oy, s),
  );
}

export function layoutHatchedArrow(viewBox = 40): HatchPart[] {
  const s = (viewBox * 0.42) / letterforms.em;
  const ox = viewBox * 0.58;
  const oy = viewBox * 0.28;
  return letterforms.arrow.parts.map((part) =>
    scalePart(part as RawPart, ox, oy, s),
  );
}
