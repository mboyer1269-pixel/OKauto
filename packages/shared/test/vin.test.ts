import { describe, expect, it } from "vitest";
import {
  computeCheckDigit,
  decodeModelYear,
  decodeVin,
  isCheckDigitValid,
  isValidVinFormat,
  normalizeVin,
} from "../src/vin.js";

describe("normalizeVin", () => {
  it("uppercases and strips separators", () => {
    expect(normalizeVin(" 1hg-cm826_33a004352 ")).toBe("1HGCM82633A004352");
  });
});

describe("isValidVinFormat", () => {
  it("accepts 17-char VIN without I/O/Q", () => {
    expect(isValidVinFormat("1HGCM82633A004352")).toBe(true);
  });
  it("rejects wrong length", () => {
    expect(isValidVinFormat("1HGCM82633A00435")).toBe(false);
  });
  it("rejects forbidden letters", () => {
    expect(isValidVinFormat("1HGCM82633A00435I")).toBe(false);
    expect(isValidVinFormat("1HGCM82633A00435O")).toBe(false);
    expect(isValidVinFormat("1HGCM82633A00435Q")).toBe(false);
  });
});

describe("check digit (ISO 3779)", () => {
  it("computes known check digit for 1HGCM82633A004352", () => {
    expect(computeCheckDigit("1HGCM82633A004352")).toBe("3");
    expect(isCheckDigitValid("1HGCM82633A004352")).toBe(true);
  });
  it("computes X remainder case: 1M8GDM9AXKP042788", () => {
    expect(computeCheckDigit("1M8GDM9AXKP042788")).toBe("X");
    expect(isCheckDigitValid("1M8GDM9AXKP042788")).toBe(true);
  });
  it("rejects tampered VIN", () => {
    expect(isCheckDigitValid("1HGCM82633A004353")).toBe(false);
  });
});

describe("decodeModelYear", () => {
  it("uses 7th-position heuristic: alpha => 1980-2009 cycle", () => {
    expect(decodeModelYear("1HGCM82633A004352")).toBe(2003);
  });
  it("numeric 7th position => 2010-2039 cycle", () => {
    // position 10 = 'A', position 7 (index 6) = '4' (numeric) => 2010
    expect(decodeModelYear("1FTFW14T4AFA00000")).toBe(2010);
  });
  it("returns undefined for bad format", () => {
    expect(decodeModelYear("BAD")).toBeUndefined();
  });
});

describe("decodeVin", () => {
  it("decodes a full record", () => {
    const r = decodeVin("1HGCM82633A004352");
    expect(r.valid).toBe(true);
    expect(r.checkDigitValid).toBe(true);
    expect(r.modelYear).toBe(2003);
    expect(r.region).toBe("United States");
    expect(r.wmiMake).toBe("Honda");
  });
  it("flags check digit mismatch but still decodes metadata", () => {
    const r = decodeVin("1HGCM82633A004353");
    expect(r.valid).toBe(false);
    expect(r.checkDigitValid).toBe(false);
    expect(r.modelYear).toBe(2003);
    expect(r.errors).toContain("Check digit mismatch");
  });
  it("reports length and forbidden-char errors", () => {
    const r = decodeVin("1HGIO");
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
