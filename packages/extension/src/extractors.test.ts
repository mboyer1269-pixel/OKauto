import { describe, expect, it } from "vitest";
import { numberFromText, parseVehicleFromTitle, parseVisibleText } from "./extractors";

describe("extension extractors", () => {
  it("parses numbers from formatted values", () => {
    expect(numberFromText("$23,995")).toBe(23995);
    expect(numberFromText("30,210 miles")).toBe(30210);
  });

  it("parses a vehicle title", () => {
    expect(parseVehicleFromTitle("2022 Toyota Camry SE - Low Miles")).toEqual({
      year: 2022,
      make: "Toyota",
      model: "Camry"
    });
  });

  it("extracts common visible text fields", () => {
    const parsed = parseVisibleText("Stock # A1024 VIN 1HGCM82633A004352 $23,995 30,210 miles");
    expect(parsed.vin).toBe("1HGCM82633A004352");
    expect(parsed.stockNumber).toBe("A1024");
    expect(parsed.price).toBe(23995);
    expect(parsed.mileage).toBe(30210);
  });
});
