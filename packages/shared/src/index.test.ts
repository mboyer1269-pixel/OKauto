import { describe, expect, it } from "vitest";
import {
  buildTemplateDescription,
  hasPermission,
  normalizeVin,
  slugify,
  vehicleTitle,
} from "./index.js";

describe("shared utils", () => {
  it("slugifies org names", () => {
    expect(slugify("Stark Motors LLC")).toBe("stark-motors-llc");
  });

  it("normalizes VINs", () => {
    expect(normalizeVin("1hgcm82633a004352")).toBe("1HGCM82633A004352");
    expect(normalizeVin("bad")).toBeNull();
  });

  it("builds titles and descriptions", () => {
    const v = {
      year: 2021,
      make: "Toyota",
      model: "Camry",
      trim: "SE",
      priceCents: 2199900,
      mileage: 34000,
    };
    expect(vehicleTitle(v)).toBe("2021 Toyota Camry SE");
    expect(buildTemplateDescription(v)).toContain("Asking price: $21,999");
  });

  it("enforces RBAC", () => {
    expect(hasPermission("salesperson", "listings:write")).toBe(true);
    expect(hasPermission("viewer", "inventory:write")).toBe(false);
    expect(hasPermission("owner", "audit:read")).toBe(true);
  });
});
