import { describe, expect, it } from "vitest";
import type { SelectorStrategy } from "@okauto/shared";
import { matchesPattern, normalizeText, resolveField, waitForElement } from "../lib/selector-engine.js";

function dom(html: string): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = html;
  return doc;
}

describe("normalizeText/matchesPattern", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizeText("  Asking   Price ")).toBe("asking price");
    expect(matchesPattern("Asking Price (USD)", "asking price")).toBe(true);
    expect(matchesPattern("Year", /year/i)).toBe(true);
    expect(matchesPattern("Mileage", "price")).toBe(false);
  });
});

describe("resolveField", () => {
  it("resolves by placeholder and reports telemetry", () => {
    const doc = dom(`<input placeholder="Listing title" />`);
    const outcome = resolveField(doc, [
      { kind: "css", selector: "#nope" },
      { kind: "placeholder", text: /title/i },
    ]);
    expect(outcome.el).not.toBeNull();
    expect(outcome.strategyIndex).toBe(1);
    expect(outcome.strategyKind).toBe("placeholder");
    expect(outcome.attempts).toBe(2);
  });

  it("resolves by label association (for/id and nested)", () => {
    const doc = dom(`
      <label for="price-input">Asking price</label><input id="price-input" />
      <label>Description <textarea></textarea></label>
    `);
    const price = resolveField(doc, [{ kind: "label", text: /asking price/i }]);
    expect((price.el as HTMLInputElement).id).toBe("price-input");
    const desc = resolveField(doc, [{ kind: "label", text: /description/i }]);
    expect(desc.el?.tagName).toBe("TEXTAREA");
  });

  it("resolves by ARIA role + accessible name", () => {
    const doc = dom(`
      <div role="combobox" aria-label="Vehicle year">2019</div>
      <div role="combobox" aria-label="Vehicle make">Ford</div>
    `);
    const outcome = resolveField(doc, [{ kind: "ariaRole", role: "combobox", name: /year/i }]);
    expect((outcome.el as HTMLElement).getAttribute("aria-label")).toBe("Vehicle year");
  });

  it("returns null telemetry when nothing matches and survives bad strategies", () => {
    const doc = dom(`<div></div>`);
    const outcome = resolveField(doc, [
      { kind: "css", selector: "[[[invalid" },
      { kind: "testId", id: "missing" },
    ]);
    expect(outcome.el).toBeNull();
    expect(outcome.strategyIndex).toBeNull();
    expect(outcome.attempts).toBe(2);
  });

  it("strategy order is respected (first match wins)", () => {
    const doc = dom(`<input data-testid="t" placeholder="Title" />`);
    const outcome = resolveField(doc, [
      { kind: "testId", id: "t" },
      { kind: "placeholder", text: "Title" },
    ]);
    expect(outcome.strategyKind).toBe("testId");
  });
});

describe("waitForElement", () => {
  it("waits for late-appearing elements", async () => {
    const doc = dom(`<div id="root"></div>`);
    setTimeout(() => {
      const input = doc.createElement("input");
      input.placeholder = "Listing title";
      doc.body.appendChild(input);
    }, 300);
    const strategies: SelectorStrategy[] = [{ kind: "placeholder", text: /title/i }];
    const outcome = await waitForElement(doc, strategies, 2000, 50);
    expect(outcome.el).not.toBeNull();
  });

  it("times out gracefully", async () => {
    const doc = dom(`<div></div>`);
    const outcome = await waitForElement(doc, [{ kind: "css", selector: "#never" }], 200, 50);
    expect(outcome.el).toBeNull();
  });
});
