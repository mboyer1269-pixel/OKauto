import { describe, expect, it } from "vitest";
import { computeVinCheckDigit, decodeVinOffline, normalizeVin, validateVin } from "../src/vin.js";

describe("normalizeVin", () => {
  it("uppercases and strips separators", () => {
    expect(normalizeVin(" 1hgcm82633a004352 ")).toBe("1HGCM82633A004352");
    expect(normalizeVin("1HG-CM8 2633A004352")).toBe("1HGCM82633A004352");
  });
});

describe("computeVinCheckDigit", () => {
  it("computes the documented example check digit", () => {
    // Well-known valid VIN example.
    expect(computeVinCheckDigit("1M8GDM9AXKP042788")).toBe("X");
    expect(computeVinCheckDigit("1HGCM82633A004352")).toBe("3");
  });
  it("returns null for invalid characters", () => {
    expect(computeVinCheckDigit("IIIIIIIIIIIIIIIII")).toBeNull();
  });
});

describe("validateVin", () => {
  it("accepts valid VINs", () => {
    const info = validateVin("1HGCM82633A004352");
    expect(info.valid).toBe(true);
    expect(info.manufacturer).toBe("Honda");
    expect(info.modelYearCandidates).toContain(2003);
  });

  it("rejects wrong length", () => {
    const info = validateVin("1HGCM8263");
    expect(info.valid).toBe(false);
    expect(info.error).toMatch(/17 characters/);
  });

  it("rejects I/O/Q characters", () => {
    const info = validateVin("1HGCM82633A00435O");
    expect(info.valid).toBe(false);
  });

  it("rejects check digit mismatch", () => {
    const info = validateVin("1HGCM82633A004353");
    expect(info.valid).toBe(false);
    expect(info.error).toMatch(/check digit/i);
  });
});

describe("decodeVinOffline", () => {
  it("decodes WMI and year candidates", () => {
    const d = decodeVinOffline("5YJ3E1EA2KF317000");
    expect(d.manufacturer).toBe("Tesla");
    expect(d.modelYearCandidates).toContain(2019);
    expect(d.modelYear).toBe(2019);
  });
});
