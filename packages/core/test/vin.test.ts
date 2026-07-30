import { describe, expect, it } from "vitest";
import {
  decodeModelYear,
  decodeVin,
  decodeVinOffline,
  isValidVin,
  normalizeVin,
} from "../src/vin.js";

// Real-format VINs with valid check digits.
const VALID_VINS = [
  "1HGCM82633A004352", // Honda Accord
  "5YJ3E1EAXKF317231", // Tesla Model 3
  "1FTFW1ET9DFC10312", // Ford F-150
  "JH4KA7561PC008269", // Acura Legend
];

describe("isValidVin", () => {
  it("accepts VINs with valid check digits", () => {
    for (const vin of VALID_VINS) expect(isValidVin(vin), vin).toBe(true);
  });

  it("rejects VINs with a corrupted check digit", () => {
    expect(isValidVin("1HGCM82634A004352")).toBe(false);
  });

  it("rejects wrong length, illegal chars (I, O, Q), and empty", () => {
    expect(isValidVin("")).toBe(false);
    expect(isValidVin("1HGCM82633A00435")).toBe(false);
    expect(isValidVin("1HGCM82633A0043I2")).toBe(false);
    expect(isValidVin("OHGCM82633A004352")).toBe(false);
  });

  it("normalizes case and whitespace", () => {
    expect(isValidVin(" 1hgcm82633a004352 ")).toBe(true);
    expect(normalizeVin(" 1hgcm82633a004352 ")).toBe("1HGCM82633A004352");
  });
});

describe("decodeModelYear", () => {
  it("decodes recent year characters", () => {
    expect(decodeModelYear("5YJ3E1EAXKF317231", 2024)).toBe(2019); // K
    expect(decodeModelYear("1FTFW1ET9DFC10312", 2024)).toBe(2013); // D
  });

  it("handles the 30-year cycle relative to the reference year", () => {
    // "A" = 1980, 2010, 2040...
    expect(decodeModelYear("1HGCM8263AA004352", 2015)).toBe(2010);
    expect(decodeModelYear("1HGCM8263AA004352", 1995)).toBe(1980);
  });
});

describe("decodeVinOffline", () => {
  it("resolves make from WMI and year from year char", () => {
    const result = decodeVinOffline("1HGCM82633A004352");
    expect(result.make).toBe("Honda");
    expect(result.valid).toBe(true);
    expect(result.source).toBe("offline");
  });

  it("returns null make for unknown WMI", () => {
    const result = decodeVinOffline("XXXCM82633A004352");
    expect(result.make).toBeNull();
  });
});

describe("decodeVin (online with fallback)", () => {
  it("uses vPIC response when available", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          Results: [
            {
              ModelYear: "2003",
              Make: "HONDA",
              Model: "Accord",
              Trim: "EX",
              BodyClass: "Sedan/Saloon",
              FuelTypePrimary: "Gasoline",
              TransmissionStyle: "Automatic",
              DriveType: "FWD",
              DisplacementL: "3.0",
              EngineConfiguration: "V-Shaped",
              EngineCylinders: "6",
            },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const result = await decodeVin("1HGCM82633A004352", { fetchImpl });
    expect(result.source).toBe("vpic");
    expect(result.make).toBe("Honda");
    expect(result.model).toBe("Accord");
    expect(result.year).toBe(2003);
    expect(result.engine).toContain("3.0L");
  });

  it("falls back to offline decode on network failure", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await decodeVin("1HGCM82633A004352", { fetchImpl });
    expect(result.source).toBe("offline");
    expect(result.make).toBe("Honda");
  });

  it("skips network entirely for invalid VINs", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    const result = await decodeVin("BADVIN", { fetchImpl });
    expect(result.valid).toBe(false);
    expect(called).toBe(false);
  });
});
