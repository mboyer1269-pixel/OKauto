import { describe, expect, it } from "vitest";
import spec from "../spec.json";
import directionA from "../directions/A.json";
import directionB from "../directions/B.json";
import directionC from "../directions/C.json";
import directionD from "../directions/D.json";
import { brandColors, contrastPairs, contrastRatio } from "../tokens";

describe("jetons Cockpit — contraste WCAG AA", () => {
  it("respecte 4,5:1 pour le texte et les boutons", () => {
    for (const pair of contrastPairs) {
      const ratio = contrastRatio(pair.fg, pair.bg);
      expect(
        ratio,
        `${pair.name} (${pair.fg} sur ${pair.bg}) = ${ratio.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(pair.min);
    }
  });
});

describe("marque — piste active D, A/B/C conservées", () => {
  it("expose le mot-symbole hachuré SUIVIA AUTO et un pictogramme S", () => {
    expect(spec.id).toBe("D");
    expect(spec.mark.kind).toBe("hatched-s");
    expect(spec.lockup).toBe("SUIVIA AUTO");
    expect(spec.wordmark).toBe("SUIVIA");
    expect(spec.descriptor).toBe("AUTO");
    expect(spec.wordmarkView?.sequence.join("")).toBe("SUIVIA AUTO");
    expect(spec.wordmarkView?.arrow).toBe(true);
  });

  it("aligne les jetons TS sur spec.json", () => {
    expect(brandColors.graphite).toBe(spec.colors.ink);
    expect(brandColors.amber).toBe(spec.colors.accent);
    expect(brandColors.ivory).toBe(spec.colors.paper);
    expect(brandColors.markBg).toBe(spec.colors.markBg);
    expect(brandColors.markFg).toBe(spec.colors.markFg);
  });

  it("garde A, B, C et D interchangeables (mêmes clés de couleurs)", () => {
    for (const direction of [
      directionA,
      directionB,
      directionC,
      directionD,
    ]) {
      expect(direction.colors).toEqual(
        expect.objectContaining({
          ink: expect.any(String),
          paper: expect.any(String),
          accent: expect.any(String),
          markBg: expect.any(String),
          markFg: expect.any(String),
        }),
      );
      expect(["stroke-s", "vin-bars", "map-pin", "hatched-s"]).toContain(
        direction.mark.kind,
      );
      expect(direction.wordmark).toBeTruthy();
      expect(direction.descriptor.toUpperCase()).toBe("AUTO");
    }
  });

  it("respecte AA pour le pictogramme de chaque piste", () => {
    for (const direction of [
      directionA,
      directionB,
      directionC,
      directionD,
    ]) {
      const ratio = contrastRatio(
        direction.colors.markFg,
        direction.colors.markBg,
      );
      expect(
        ratio,
        `${direction.id} markFg sur markBg = ${ratio.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
