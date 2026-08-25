import { describe, it, expect } from "vitest";
import {
  generateTemplateDescription,
  generateListingTitle,
  generateMarketplaceTitle,
  generateMarketplacePackage,
} from "../description";
import {
  createListingSchema,
  isFacebookMarketplaceItemUrl,
  loginSchema,
  registerSchema,
} from "../index";
import { isValidVinFormat, normalizeVin } from "../vin";

describe("description", () => {
  it("generates listing title from vehicle data", () => {
    const title = generateListingTitle({
      year: 2022,
      make: "Honda",
      model: "Accord",
      trim: "Sport",
    });
    expect(title).toBe("2022 Honda Accord Sport");
  });

  it("generates template description with key fields", () => {
    const desc = generateTemplateDescription({
      year: 2022,
      make: "Honda",
      model: "Accord",
      price: 32995,
      mileage: 25000,
      exteriorColor: "Black",
      transmission: "Automatique",
      features: ["Sièges chauffants", "Caméra de recul", "sièges chauffants"],
      dealershipName: "Demo Motors",
      contactName: "Michael Boyer",
      phone: "555-1234",
      stockNumber: "U1234",
    });
    expect(desc).toContain("2022 Honda Accord");
    expect(desc).toContain("32 995");
    expect(desc).toContain("25 000 km");
    expect(desc).toContain("Je vous présente ce véhicule : 2022 Honda Accord.");
    expect(desc).toContain("Il est présentement disponible chez Demo Motors.");
    expect(desc).toContain(
      "Côté configuration, il comprend une transmission Automatique.",
    );
    expect(desc).toContain("POINTS CLÉS");
    expect(desc).toContain("• Transmission : Automatique");
    expect(desc).toContain("ÉQUIPEMENTS À RETENIR");
    expect(desc.match(/Sièges chauffants/gi)).toHaveLength(1);
    expect(desc).toContain(
      "Écrivez-moi directement ici sur Messenger — Michael Boyer.",
    );
    expect(desc).toContain(
      "m’appeler directement à la concession au 555-1234 et demander Michael Boyer",
    );
    expect(desc).not.toContain("Écrivez-nous");
    expect(desc).toContain("Référence : stock U1234");
    expect(desc).not.toContain("Quantité disponible");
    expect(desc).toContain("Aucun frais obligatoire additionnel");
  });

  it("does not invent missing vehicle details", () => {
    const desc = generateTemplateDescription({
      year: 2024,
      make: "GMC",
      model: "Terrain",
      price: 39995,
    });

    expect(desc).not.toContain("Kilométrage");
    expect(desc).not.toContain("Transmission");
    expect(desc).not.toContain("Financement");
    expect(desc).not.toContain("Garantie");
  });

  it("generates a concise marketplace title", () => {
    const title = generateMarketplaceTitle({
      year: 2022,
      make: "Honda",
      model: "Accord",
      mileage: 25000,
    });
    expect(title).toBe("2022 Honda Accord");
  });

  it("blocks an incomplete used-vehicle package", () => {
    const pkg = generateMarketplacePackage({
      year: 2022,
      make: "Honda",
      model: "Accord",
      condition: "Usagé",
      price: 24000,
    });
    expect(pkg.isReady).toBe(false);
    expect(pkg.blockers).toContain(
      "Kilométrage requis pour un véhicule usagé.",
    );
  });
});

describe("vin", () => {
  it("normalizes VIN to uppercase", () => {
    expect(normalizeVin("1hgbh41jxmn109186")).toBe("1HGBH41JXMN109186");
  });

  it("validates VIN format", () => {
    expect(isValidVinFormat("1HGBH41JXMN109186")).toBe(true);
    expect(isValidVinFormat("INVALID")).toBe(false);
    expect(isValidVinFormat("1HGBH41JXMN10918")).toBe(false);
  });
});

describe("listing schema", () => {
  it("accepts decimal prices serialized by Prisma", () => {
    const listing = createListingSchema.parse({
      vehicleId: "vehicle-1",
      platform: "facebook_marketplace",
      externalUrl: "https://www.facebook.com/marketplace/item/123",
      priceAtListing: "53995",
    });

    expect(listing.priceAtListing).toBe(53995);
  });

  it("only accepts published Facebook Marketplace item URLs", () => {
    expect(
      isFacebookMarketplaceItemUrl(
        "https://www.facebook.com/marketplace/item/123456",
      ),
    ).toBe(true);
    expect(
      isFacebookMarketplaceItemUrl(
        "https://m.facebook.com/marketplace/item/123456/",
      ),
    ).toBe(true);
    expect(
      isFacebookMarketplaceItemUrl(
        "https://www.facebook.com/marketplace/create/vehicle",
      ),
    ).toBe(false);
    expect(
      isFacebookMarketplaceItemUrl(
        "https://evilfacebook.com/marketplace/item/123456",
      ),
    ).toBe(false);
  });
});

describe("authentication schemas", () => {
  it("normalizes professional email addresses before authentication", () => {
    expect(
      loginSchema.parse({
        email: "  MBoyer@BuckinghamGM.com ",
        password: "secret",
      }).email,
    ).toBe("mboyer@buckinghamgm.com");

    expect(
      registerSchema.parse({
        email: "MBoyer@BuckinghamGM.com",
        password: "MotDePasse!123",
        name: "Michael Boyer",
        organizationName: "Buckingham Chevrolet Buick GMC",
      }).email,
    ).toBe("mboyer@buckinghamgm.com");
  });
});
