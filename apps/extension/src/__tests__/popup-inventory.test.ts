import { describe, expect, it } from "vitest";
import {
  filterVehicles,
  formatVehicleMeta,
  formatVehicleVin,
  vehicleHeading,
} from "../popup-inventory";

const vehicles = [
  {
    id: "1",
    year: 2022,
    make: "Honda",
    model: "Accord",
    trim: "Sport",
    stockNumber: "U17404",
    vin: "1HGBH41JXMN109186",
    mileage: 25000,
    price: 24995,
    photoCount: 8,
  },
  {
    id: "2",
    year: 2025,
    make: "GMC",
    model: "Terrain",
    stockNumber: "U20011",
    vin: "3GKALVEV0NL123456",
    mileage: 12000,
    price: 39995,
  },
];

describe("popup inventory", () => {
  it("shows stock number and VIN for the dealer list", () => {
    expect(vehicleHeading(vehicles[0])).toBe("2022 Honda Accord Sport");
    expect(formatVehicleMeta(vehicles[0])).toContain("Stock U17404");
    expect(formatVehicleVin(vehicles[0])).toBe("NIV 1HGBH41JXMN109186");
  });

  it("filters the VIN list by stock, NIV fragment, or model", () => {
    expect(filterVehicles(vehicles, "u17404").map((vehicle) => vehicle.id)).toEqual([
      "1",
    ]);
    expect(
      filterVehicles(vehicles, "1hgbh41jxmn").map((vehicle) => vehicle.id),
    ).toEqual(["1"]);
    expect(filterVehicles(vehicles, "terrain").map((vehicle) => vehicle.id)).toEqual(
      ["2"],
    );
    expect(filterVehicles(vehicles, "zzz")).toEqual([]);
  });
});
