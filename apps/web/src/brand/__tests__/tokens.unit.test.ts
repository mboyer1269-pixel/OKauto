import { describe, expect, it } from "vitest";
import spec from "../spec.json";
import { contrastPairs, contrastRatio } from "../tokens";

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

describe("marque direction B — Le Code", () => {
  it("expose 17 barres (caractères NIV) et des simplifications 7 et 5", () => {
    expect(spec.id).toBe("B");
    expect(spec.mark.kind).toBe("vin-bars");
    expect(spec.wordmark).toBe("SUIVIA");
    expect(spec.descriptor).toBe("Auto");
    expect(spec.bars["17"]).toHaveLength(17);
    expect(spec.bars["7"]).toHaveLength(7);
    expect(spec.bars["5"]).toHaveLength(5);
  });
});
