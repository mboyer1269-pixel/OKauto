import { describe, expect, it } from "vitest";
import { parseInventoryCsv, vehicleContentHash } from "./inventory";
import { templateDescription, sanitizeDescription } from "./ai";

describe("parseInventoryCsv", () => {
  it("parses valid rows and photo urls", () => {
    const csv = `stockNumber,year,make,model,price,vin,photos
H2001,2020,Toyota,Camry,18999,4T1B11HK5KU123456,https://example.com/a.jpg|https://example.com/b.jpg`;
    const { rows, errors } = parseInventoryCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.make).toBe("Toyota");
    expect(rows[0]?.priceCents).toBe(1899900);
    expect(rows[0]?.photoUrls).toHaveLength(2);
  });

  it("reports missing required columns", () => {
    const { errors } = parseInventoryCsv("a,b\n1,2");
    expect(errors[0]?.message).toMatch(/Required columns/);
  });
});

describe("vehicleContentHash", () => {
  it("changes when price changes", () => {
    const a = vehicleContentHash({
      stockNumber: "1",
      priceCents: 100,
      status: "AVAILABLE",
      mileage: 10,
    });
    const b = vehicleContentHash({
      stockNumber: "1",
      priceCents: 200,
      status: "AVAILABLE",
      mileage: 10,
    });
    expect(a).not.toBe(b);
  });
});

describe("templateDescription", () => {
  it("includes title and price", () => {
    const body = templateDescription({
      id: "1",
      year: 2021,
      make: "Honda",
      model: "Accord",
      trim: "Sport",
      priceCents: 2399900,
      mileage: 10000,
    });
    expect(body).toContain("2021 Honda Accord Sport");
    expect(body).toContain("23,999");
  });

  it("sanitizes banned phrases", () => {
    expect(sanitizeDescription("This is guaranteed financing")).not.toMatch(/guaranteed/i);
  });
});
