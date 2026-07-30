import { describe, expect, it } from "vitest";
import {
  normalizeBodyStyle,
  normalizeCsvRecord,
  normalizeDrivetrain,
  normalizeFuelType,
  normalizeJsonRecord,
  normalizeTransmission,
  parseIntSafe,
  parseMoneyToCents,
} from "../src/normalize.js";

describe("parseMoneyToCents", () => {
  it("parses currency strings", () => {
    expect(parseMoneyToCents("$24,999")).toBe(2499900);
    expect(parseMoneyToCents("24999.50")).toBe(2499950);
    expect(parseMoneyToCents(15000)).toBe(1500000);
    expect(parseMoneyToCents("")).toBeUndefined();
    expect(parseMoneyToCents("n/a")).toBeUndefined();
  });
});

describe("parseIntSafe", () => {
  it("parses ints with separators", () => {
    expect(parseIntSafe("42,100")).toBe(42100);
    expect(parseIntSafe("")).toBeUndefined();
  });
});

describe("enum normalizers", () => {
  it("normalizes body styles", () => {
    expect(normalizeBodyStyle("Sport Utility Vehicle")).toBe("SUV");
    expect(normalizeBodyStyle("Crew Cab Pickup")).toBe("TRUCK");
    expect(normalizeBodyStyle("4dr Sedan")).toBe("SEDAN");
    expect(normalizeBodyStyle("weird")).toBe("OTHER");
    expect(normalizeBodyStyle(undefined)).toBeUndefined();
  });
  it("normalizes transmissions", () => {
    expect(normalizeTransmission("6-Speed A/T")).toBe("AUTOMATIC");
    expect(normalizeTransmission("Manual 5spd")).toBe("MANUAL");
    expect(normalizeTransmission("CVT")).toBe("CVT");
  });
  it("normalizes fuel", () => {
    expect(normalizeFuelType("Plug-In Hybrid")).toBe("PLUGIN_HYBRID");
    expect(normalizeFuelType("Regular Unleaded")).toBe("GASOLINE");
    expect(normalizeFuelType("EV")).toBe("ELECTRIC");
  });
  it("normalizes drivetrain", () => {
    expect(normalizeDrivetrain("All Wheel Drive")).toBe("AWD");
    expect(normalizeDrivetrain("4x4")).toBe("FOUR_WD");
  });
});

describe("normalizeCsvRecord", () => {
  const headers = ["VIN", "Stock #", "Year", "Make", "Model", "Trim", "Body", "Miles", "Price", "Ext Color", "Transmission", "Fuel Type", "Photos"];

  it("normalizes a realistic DMS row", () => {
    const rec = {
      VIN: "1hgcm82633a004352",
      "Stock #": "P1234",
      Year: "2003",
      Make: "Honda",
      Model: "Accord",
      Trim: "EX V6",
      Body: "Coupe",
      Miles: "88,412",
      Price: "$8,995",
      "Ext Color": "Graphite Pearl",
      Transmission: "5-Speed Automatic",
      "Fuel Type": "Gasoline",
      Photos: "https://cdn.example.com/1.jpg|https://cdn.example.com/2.jpg",
    };
    const result = normalizeCsvRecord(rec, headers);
    expect(result.ok).toBe(true);
    expect(result.vehicle).toMatchObject({
      vin: "1HGCM82633A004352",
      stockNumber: "P1234",
      year: 2003,
      make: "Honda",
      model: "Accord",
      bodyStyle: "COUPE",
      mileage: 88412,
      priceCents: 899500,
      transmission: "AUTOMATIC",
      fuelType: "GASOLINE",
      photoUrls: ["https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpg"],
    });
  });

  it("reports errors for unusable rows", () => {
    const result = normalizeCsvRecord({ VIN: "123", Year: "1800", Make: "", Model: "" }, ["VIN", "Year", "Make", "Model"]);
    expect(result.ok).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });
});

describe("normalizeJsonRecord", () => {
  it("normalizes JSON feed items including arrays", () => {
    const result = normalizeJsonRecord({
      vin: "5YJ3E1EA2KF317000",
      year: 2019,
      make: "Tesla",
      model: "Model 3",
      price: 27500,
      fuel_type: "Electric",
      images: ["https://cdn.example.com/t1.jpg", "https://cdn.example.com/t2.jpg"],
    });
    expect(result.ok).toBe(true);
    expect(result.vehicle).toMatchObject({
      vin: "5YJ3E1EA2KF317000",
      priceCents: 2750000,
      fuelType: "ELECTRIC",
      photoUrls: ["https://cdn.example.com/t1.jpg", "https://cdn.example.com/t2.jpg"],
    });
  });
});
