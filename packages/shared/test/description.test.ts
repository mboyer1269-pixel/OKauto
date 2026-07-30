import { describe, expect, it } from "vitest";
import { formatUsd, generateDescription, vehicleTitle } from "../src/description.js";
import { buildMarketplaceDraft } from "../src/marketplace.js";

const vehicle = {
  id: "00000000-0000-0000-0000-000000000001",
  year: 2021,
  make: "Toyota",
  model: "RAV4",
  trim: "XLE",
  bodyStyle: "SUV" as const,
  condition: "USED" as const,
  mileage: 30500,
  priceCents: 2649900,
  exteriorColor: "Lunar Rock",
  interiorColor: "Black",
  transmission: "AUTOMATIC" as const,
  fuelType: "GASOLINE" as const,
  drivetrain: "AWD" as const,
  engine: "2.5L I4",
  doors: 4,
  features: ["Blind spot monitor", "Apple CarPlay"],
  dealershipName: "Demo Motors",
  dealershipPhone: "(555) 010-2030",
  dealershipCity: "Austin",
};

describe("formatUsd", () => {
  it("formats whole dollars without cents", () => {
    expect(formatUsd(2649900)).toBe("$26,499");
    expect(formatUsd(2649950)).toBe("$26,499.50");
  });
});

describe("generateDescription", () => {
  it("includes facts and disclaimer", () => {
    const text = generateDescription(vehicle);
    expect(text).toContain("2021 Toyota RAV4 XLE");
    expect(text).toContain("30,500 miles");
    expect(text).toContain("$26,499");
    expect(text).toContain("All-wheel drive");
    expect(text).toContain("Demo Motors");
    expect(text).toContain("Price excludes tax");
  });

  it("omits disclaimer when disabled and respects max length", () => {
    const text = generateDescription(vehicle, { includeDisclaimer: false, maxLength: 200 });
    expect(text).not.toContain("Price excludes tax");
    expect(text.length).toBeLessThanOrEqual(200);
  });

  it("never fabricates missing specs", () => {
    const text = generateDescription({ year: 2020, make: "Kia", model: "Soul" });
    expect(text).not.toContain("Mileage");
    expect(text).not.toContain("$");
  });
});

describe("buildMarketplaceDraft", () => {
  it("maps vehicle to marketplace field payload", () => {
    const draft = buildMarketplaceDraft(vehicle, generateDescription(vehicle));
    expect(draft.title).toBe(vehicleTitle(vehicle));
    expect(draft.price).toBe("26499");
    expect(draft.mileage).toBe("30500");
    expect(draft.bodyStyleLabels).toContain("SUV");
    expect(draft.transmissionLabels).toContain("Automatic transmission");
    expect(draft.description.length).toBeGreaterThan(50);
  });
});
