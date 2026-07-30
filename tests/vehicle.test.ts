import { describe, expect, it } from "vitest";

import { groundedDescription, isValidVin, listingTitle, normalizeVin, vehicleInput } from "@/lib/vehicle";

describe("VIN validation", () => {
  it("normalizes and validates ISO 3779 VINs", () => {
    expect(normalizeVin("1hgcm82633a004352")).toBe("1HGCM82633A004352");
    expect(isValidVin("1HGCM82633A004352")).toBe(true);
    expect(isValidVin("1M8GDM9AXKP042788")).toBe(true);
  });

  it("rejects forbidden characters, length, and invalid check digits", () => {
    expect(isValidVin("1HGCM82633A004353")).toBe(false);
    expect(isValidVin("1HGCM82I33A004352")).toBe(false);
    expect(isValidVin("short")).toBe(false);
  });
});

describe("grounded listing generation", () => {
  const vehicle = vehicleInput.parse({
    vin: "1HGCM82633A004352",
    stockNumber: "A-42",
    year: 2022,
    make: "Honda",
    model: "Accord",
    trim: "Sport",
    mileage: 28450,
    priceCents: 2699500,
    exteriorColor: "Gray",
    photos: ["https://example.com/car.jpg"],
  });

  it("creates a concise title from known identity facts", () => {
    expect(listingTitle(vehicle)).toBe("2022 Honda Accord Sport");
  });

  it("uses only supplied facts and a verification disclaimer", () => {
    const result = groundedDescription(vehicle, "Northstar Motors");
    expect(result).toContain("28,450 miles");
    expect(result).toContain("$26,995");
    expect(result).toContain("subject to verification");
    expect(result).not.toMatch(/warranty|accident-free|financing available/i);
  });

  it("requires a VIN or stock number", () => {
    expect(() =>
      vehicleInput.parse({ year: 2020, make: "Test", model: "Car", priceCents: 100, photos: [] }),
    ).toThrow();
  });
});
