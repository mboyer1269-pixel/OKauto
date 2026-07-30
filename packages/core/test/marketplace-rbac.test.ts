import { describe, expect, it } from "vitest";
import { mapBodyStyle, mapCondition, mapFuelType, mapTransmission, toMarketplaceFields } from "../src/marketplace.js";
import { canManageRole, roleAtLeast } from "../src/rbac.js";

describe("marketplace field mapping", () => {
  it("maps body styles to Marketplace vocabulary", () => {
    expect(mapBodyStyle("Sport Utility Vehicle (SUV)")).toBe("SUV");
    expect(mapBodyStyle("Crew Cab Pickup")).toBe("Truck");
    expect(mapBodyStyle("Sedan/Saloon")).toBe("Sedan");
    expect(mapBodyStyle(null)).toBe("Other");
  });

  it("maps fuel and transmission", () => {
    expect(mapFuelType("Plug-in Hybrid Electric")).toBe("Plug-in hybrid");
    expect(mapFuelType("Diesel")).toBe("Diesel");
    expect(mapFuelType(null)).toBe("Gasoline");
    expect(mapTransmission("6-Speed Manual")).toBe("Manual transmission");
    expect(mapTransmission("CVT")).toBe("Automatic transmission");
  });

  it("maps condition using mileage bands", () => {
    expect(mapCondition("NEW", 0)).toBe("Excellent");
    expect(mapCondition("USED", 25_000)).toBe("Excellent");
    expect(mapCondition("USED", 90_000)).toBe("Good");
    expect(mapCondition("USED", 150_000)).toBe("Fair");
  });

  it("builds complete Marketplace fields", () => {
    const fields = toMarketplaceFields({
      year: 2021,
      make: "Toyota",
      model: "RAV4",
      trim: "XLE",
      mileage: 32_500,
      priceCents: 2_749_900,
      condition: "USED",
      bodyStyle: "SUV",
      fuelType: "Gasoline",
      transmission: "Automatic",
      description: "desc",
    });
    expect(fields.title).toBe("2021 Toyota RAV4 XLE");
    expect(fields.price).toBe("27499");
    expect(fields.mileage).toBe("32500");
    expect(fields.model).toBe("RAV4 XLE");
  });
});

describe("rbac", () => {
  it("enforces the role hierarchy", () => {
    expect(roleAtLeast("OWNER", "MANAGER")).toBe(true);
    expect(roleAtLeast("MANAGER", "OWNER")).toBe(false);
    expect(roleAtLeast("SALESPERSON", "SALESPERSON")).toBe(true);
  });

  it("restricts who can manage whom", () => {
    expect(canManageRole("OWNER", "OWNER")).toBe(true);
    expect(canManageRole("MANAGER", "SALESPERSON")).toBe(true);
    expect(canManageRole("MANAGER", "MANAGER")).toBe(false);
    expect(canManageRole("SALESPERSON", "SALESPERSON")).toBe(false);
  });
});
