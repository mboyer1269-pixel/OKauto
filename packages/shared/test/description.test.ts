import { describe, expect, it } from "vitest";
import {
  BANNED_PHRASES,
  DEFAULT_COMPLIANCE_FOOTER,
  buildListingTitle,
  renderDescription,
  renderTemplate,
  scrubBannedPhrases,
} from "../src/description.js";

const vehicle = {
  year: 2021,
  make: "Toyota",
  model: "Camry",
  trim: "SE",
  mileage: 42310,
  bodyStyle: "SEDAN",
  fuelType: "GASOLINE",
  transmission: "AUTOMATIC",
  drivetrain: "FWD",
  exteriorColor: "Silver",
  condition: "USED",
  vin: "4T1B11HK5MU000000",
  stockNumber: "P1234",
};

describe("renderTemplate", () => {
  it("interpolates variables and conditional sections", () => {
    const out = renderTemplate("{{year}} {{make}}{{#trim}} {{trim}}{{/trim}}!", {
      year: "2021",
      make: "Toyota",
      trim: "SE",
    });
    expect(out).toBe("2021 Toyota SE!");
  });
  it("omits conditional sections when var empty", () => {
    const out = renderTemplate("{{make}}{{#trim}} {{trim}}{{/trim}}", { make: "Toyota", trim: "" });
    expect(out).toBe("Toyota");
  });
});

describe("renderDescription", () => {
  it("renders facts, dealer line and compliance footer", () => {
    const { text, removedPhrases } = renderDescription({
      vehicle,
      dealerName: "Demo Motors",
      dealerContact: "555-0100",
    });
    expect(text).toContain("2021 Toyota Camry SE");
    expect(text).toContain("Mileage: 42,310 mi");
    expect(text).toContain("VIN: 4T1B11HK5MU000000");
    expect(text).toContain("Offered by Demo Motors");
    expect(text).toContain(DEFAULT_COMPLIANCE_FOOTER.slice(0, 30));
    expect(removedPhrases).toHaveLength(0);
  });

  it("supports custom templates", () => {
    const { text } = renderDescription({ vehicle, template: "{{make}} {{model}} ({{year}})" });
    expect(text).toBe("Toyota Camry (2021)");
  });

  it("scrubs banned phrases from template output", () => {
    const { text, removedPhrases } = renderDescription({
      vehicle,
      template: `{{make}} {{model}} — ${BANNED_PHRASES[0]!} — guaranteed approval!`,
    });
    expect(text.toLowerCase()).not.toContain("guaranteed approval");
    expect(removedPhrases.length).toBeGreaterThanOrEqual(2);
  });
});

describe("scrubBannedPhrases", () => {
  it("removes case-insensitively and reports removals", () => {
    const { text, removed } = scrubBannedPhrases("ACT NOW! This WON'T LAST!!!");
    expect(removed).toContain("act now");
    expect(text).not.toMatch(/act now/i);
    expect(text).not.toMatch(/won't last/i);
  });
});

describe("buildListingTitle", () => {
  it("builds and bounds title", () => {
    expect(buildListingTitle(vehicle)).toBe("2021 Toyota Camry SE");
    const long = buildListingTitle({ ...vehicle, model: "X".repeat(200) }, 99);
    expect(long.length).toBeLessThanOrEqual(99);
  });
});
