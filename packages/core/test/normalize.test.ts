import { describe, expect, it } from "vitest";
import {
  dedupeKey,
  normalizeCondition,
  normalizeMake,
  normalizeVehicle,
  parseMileage,
  parsePriceToCents,
} from "../src/normalize.js";

describe("parsePriceToCents", () => {
  it("parses currency strings", () => {
    expect(parsePriceToCents("$24,995")).toBe(2_499_500);
    expect(parsePriceToCents("24995.50")).toBe(2_499_550);
    expect(parsePriceToCents("24 995")).toBe(2_499_500);
    expect(parsePriceToCents(19999)).toBe(1_999_900);
  });

  it("returns null for garbage", () => {
    expect(parsePriceToCents("call for price")).toBeNull();
    expect(parsePriceToCents("")).toBeNull();
    expect(parsePriceToCents(null)).toBeNull();
    expect(parsePriceToCents(-5)).toBeNull();
  });
});

describe("parseMileage", () => {
  it("parses mileage variants", () => {
    expect(parseMileage("42,113 mi")).toBe(42113);
    expect(parseMileage("42113")).toBe(42113);
    expect(parseMileage("42k")).toBe(42000);
    expect(parseMileage("12.5k")).toBe(12500);
    expect(parseMileage(88000)).toBe(88000);
  });

  it("returns null for garbage", () => {
    expect(parseMileage("unknown")).toBeNull();
    expect(parseMileage(null)).toBeNull();
  });
});

describe("normalizeCondition / normalizeMake", () => {
  it("maps condition synonyms", () => {
    expect(normalizeCondition("New")).toBe("NEW");
    expect(normalizeCondition("CPO")).toBe("CERTIFIED_PRE_OWNED");
    expect(normalizeCondition("Certified Pre-Owned")).toBe("CERTIFIED_PRE_OWNED");
    expect(normalizeCondition("used")).toBe("USED");
    expect(normalizeCondition(undefined)).toBe("USED");
  });

  it("title-cases makes with brand exceptions", () => {
    expect(normalizeMake("toyota")).toBe("Toyota");
    expect(normalizeMake("bmw")).toBe("BMW");
    expect(normalizeMake("MERCEDES-BENZ")).toBe("Mercedes-Benz");
    expect(normalizeMake("alfa romeo")).toBe("Alfa Romeo");
  });
});

describe("normalizeVehicle", () => {
  it("normalizes a messy record and reports non-fatal issues", () => {
    const result = normalizeVehicle({
      vin: " 1hgcm82633a004352",
      stockNumber: " A123 ",
      year: "2003" as unknown as number,
      make: "honda",
      model: "Accord",
      mileage: "88,000 mi" as unknown as number,
      priceCents: "$8,995" as unknown as number,
      condition: "cpo" as never,
      photoUrls: ["https://cdn.example.com/1.jpg", "not-a-url"],
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.vin).toBe("1HGCM82633A004352");
    expect(result.make).toBe("Honda");
    expect(result.mileage).toBe(88000);
    expect(result.priceCents).toBe(899_500);
    expect(result.condition).toBe("CERTIFIED_PRE_OWNED");
    expect(result.photoUrls).toEqual(["https://cdn.example.com/1.jpg"]);
    expect(result.issues).toHaveLength(0);
  });

  it("keeps the record but flags an invalid VIN", () => {
    const result = normalizeVehicle({ vin: "NOTAVIN", make: "Ford", model: "F-150" });
    if ("error" in result) throw new Error("expected success");
    expect(result.vin).toBeNull();
    expect(result.issues[0]?.field).toBe("vin");
  });

  it("rejects records missing make/model", () => {
    expect(normalizeVehicle({ make: "", model: "X" })).toEqual({
      error: "make and model are required",
    });
  });

  it("flags implausible years", () => {
    const result = normalizeVehicle({ make: "Ford", model: "F-150", year: 1492 as never });
    if ("error" in result) throw new Error("expected success");
    expect(result.year).toBeNull();
    expect(result.issues.some((i) => i.field === "year")).toBe(true);
  });
});

describe("dedupeKey", () => {
  it("prefers VIN, then stock, then fingerprint", () => {
    expect(dedupeKey({ vin: "1HGCM82633A004352", make: "Honda", model: "Accord" })).toBe(
      "vin:1HGCM82633A004352",
    );
    expect(dedupeKey({ stockNumber: " A123 ", make: "Honda", model: "Accord" })).toBe("stock:a123");
    expect(dedupeKey({ year: 2003, make: "Honda", model: "Accord", mileage: 88_200 })).toBe(
      "fp:2003|honda|accord|176",
    );
  });

  it("buckets mileage so odometer drift does not create duplicates", () => {
    const a = dedupeKey({ year: 2003, make: "Honda", model: "Accord", mileage: 88_100 });
    const b = dedupeKey({ year: 2003, make: "Honda", model: "Accord", mileage: 88_200 });
    expect(a).toBe(b);
  });
});
