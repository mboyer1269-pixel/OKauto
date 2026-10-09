import { describe, expect, it } from "vitest";
import spec from "../spec.json";
import directionA from "../directions/A.json";
import directionB from "../directions/B.json";
import directionC from "../directions/C.json";
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

describe("marque — piste active B, swap A/C prêt", () => {
  it("expose 17 barres et des simplifications 7 et 5", () => {
    expect(spec.id).toBe("B");
    expect(spec.mark.kind).toBe("vin-bars");
    expect(spec.wordmark).toBe("SUIVIA");
    expect(spec.descriptor).toBe("Auto");
    expect(spec.bars["17"]).toHaveLength(17);
    expect(spec.bars["7"]).toHaveLength(7);
    expect(spec.bars["5"]).toHaveLength(5);
  });

  it("aligne les jetons TS sur spec.json", () => {
    expect(brandColors.graphite).toBe(spec.colors.ink);
    expect(brandColors.amber).toBe(spec.colors.accent);
    expect(brandColors.ivory).toBe(spec.colors.paper);
    expect(brandColors.markBg).toBe(spec.colors.markBg);
    expect(brandColors.markFg).toBe(spec.colors.markFg);
  });

  it("garde A, B et C interchangeables (mêmes clés de couleurs)", () => {
    for (const direction of [directionA, directionB, directionC]) {
      expect(direction.colors).toEqual(
        expect.objectContaining({
          ink: expect.any(String),
          paper: expect.any(String),
          accent: expect.any(String),
          markBg: expect.any(String),
          markFg: expect.any(String),
        }),
      );
      expect(["stroke-s", "vin-bars", "map-pin"]).toContain(direction.mark.kind);
      expect(direction.wordmark).toBeTruthy();
      expect(direction.descriptor).toBe("Auto");
    }
  });

  it("respecte AA pour le pictogramme de chaque piste", () => {
    for (const direction of [directionA, directionB, directionC]) {
      const ratio = contrastRatio(direction.colors.markFg, direction.colors.markBg);
      expect(
        ratio,
        `${direction.id} markFg sur markBg = ${ratio.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
