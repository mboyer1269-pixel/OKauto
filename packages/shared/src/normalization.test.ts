import { describe, expect, it } from "vitest";
import { canonicalizeUrl, isLikelyDuplicate, normalizeVehicle, vehicleIdentityKey } from "./normalization.js";

describe("normalization", () => {
  it("removes tracking parameters from canonical urls", () => {
    expect(canonicalizeUrl("https://dealer.test/car?utm_source=x&stock=123&fbclid=abc#photos")).toBe(
      "https://dealer.test/car?stock=123"
    );
  });

  it("normalizes VINs and feature lists", () => {
    const normalized = normalizeVehicle({
      vin: " 1hgcm82633a004352 ",
      year: 2022,
      make: " Toyota ",
      model: " Camry ",
      features: ["Backup Camera", "Backup Camera", "  Lane Assist  "],
      status: "AVAILABLE"
    });

    expect(normalized.vin).toBe("1HGCM82633A004352");
    expect(normalized.make).toBe("Toyota");
    expect(normalized.features).toEqual(["Backup Camera", "Lane Assist"]);
  });

  it("builds stable identity keys and duplicate decisions", () => {
    const vehicle = {
      vin: "1HGCM82633A004352",
      year: 2022,
      make: "Toyota",
      model: "Camry",
      features: [],
      status: "AVAILABLE" as const
    };

    expect(vehicleIdentityKey(vehicle)).toBe("vin:1HGCM82633A004352");
    expect(isLikelyDuplicate(vehicle, { ...vehicle, mileage: 100 })).toBe(true);
    expect(
      isLikelyDuplicate(vehicle, {
        year: 2022,
        make: "Toyota",
        model: "RAV4",
        features: [],
        status: "AVAILABLE"
      })
    ).toBe(false);
  });
});
