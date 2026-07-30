import { describe, expect, it } from "vitest";
import { buildListingTitle, buildMarketplaceDescription, buildPhotoChecklist } from "./description.js";

const vehicle = {
  year: 2024,
  make: "Honda",
  model: "CR-V",
  trim: "EX-L",
  mileage: 8110,
  price: 34500,
  exteriorColor: "Silver",
  interiorColor: "Gray",
  transmission: "Automatic",
  drivetrain: "AWD",
  fuelType: "Gasoline",
  features: ["Leather", "Sunroof", "Blind Spot Monitor"],
  status: "AVAILABLE" as const
};

describe("description generation", () => {
  it("creates marketplace-safe titles and descriptions", () => {
    expect(buildListingTitle(vehicle)).toBe("2024 Honda CR-V EX-L");
    const description = buildMarketplaceDescription(vehicle, {
      dealershipName: "OKauto",
      city: "Findlay, OH"
    });

    expect(description).toContain("2024 Honda CR-V EX-L available now from OKauto in Findlay, OH.");
    expect(description).toContain("Listed at $34,500.");
    expect(description).toContain("Availability, mileage, pricing");
  });

  it("returns remaining photo checklist items", () => {
    expect(buildPhotoChecklist(6)).toEqual(["Wheels and tire tread", "VIN plate or window sticker when appropriate"]);
    expect(buildPhotoChecklist(8)[0]).toContain("complete");
  });
});
