import { describe, it, expect } from "vitest";
import {
  appendCarfaxMention,
  CARFAX_MENTION_FR,
  carfaxMentionFr,
  ensureCarfaxMention,
  generateListingTitle,
  generateMarketplacePackage,
  generateMarketplaceTitle,
  generateTemplateDescription,
  shouldIncludeCarfaxMention,
} from "../description";
import {
  createListingSchema,
  isFacebookMarketplaceItemUrl,
  loginSchema,
  registerSchema,
  updateMarketplaceDraftSchema,
} from "../index";
import {
  emptyFieldsFromVinDecode,
  fillEmptyStringFieldsFromVinDecode,
  isRetryableVinDecodeError,
  isValidVinFormat,
  normalizeVin,
  vehicleNeedsVinDecode,
} from "../vin";

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
    expect(desc).toContain(
      "Voici le 2022 Honda Accord d’occasion que j’ai présentement en inventaire chez Demo Motors.",
    );
    expect(desc).toContain(
      "Sa configuration comprend une transmission Automatique.",
    );
    expect(desc).toContain("LA FICHE EN BREF");
    expect(desc).toContain("• Transmission : Automatique");
    expect(desc).toContain("ÉQUIPEMENTS QUI RESSORTENT");
    expect(desc.match(/Sièges chauffants/gi)).toHaveLength(1);
    expect(desc).toContain(
      "Écrivez-moi directement ici sur Messenger — Michael Boyer — et je vous répondrai personnellement.",
    );
    expect(desc).toContain(
      "m’appeler directement à la concession au 555-1234 et demander Michael Boyer",
    );
    expect(desc).not.toContain("Écrivez-nous");
    expect(desc).toContain("Référence : stock U1234");
    expect(desc).not.toContain("Quantité disponible");
    expect(desc).toContain("Prix tout inclus :");
    expect(desc).toContain(
      "Seules la TPS, la TVQ et, le cas échéant, le droit spécifique sur les pneus neufs s'ajoutent.",
    );
    expect(desc).not.toMatch(/^Aucun frais obligatoire additionnel$/m);
    expect(desc).toContain(CARFAX_MENTION_FR);
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

  it("trusts the dealer URL over an incorrect new condition", () => {
    const desc = generateTemplateDescription({
      year: 2025,
      make: "Volkswagen",
      model: "Golf R",
      condition: "New",
      mileage: 24500,
      stockNumber: "U17404",
      sourceUrl:
        "https://www.buckinghamgm.com/occasion/Volkswagen-Golf_R-2025.html",
    });

    expect(desc).toContain("d’occasion");
    expect(desc).not.toContain("Golf R neuf");
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

  it("fills only empty fields and never overwrites dealer trim", () => {
    const { patch, filled, skipped } = emptyFieldsFromVinDecode(
      {
        year: 2024,
        make: "GMC",
        model: "",
        trim: "SLE",
        engine: null,
      },
      {
        vin: "1GNEVHKW0RJ123456",
        year: 2023,
        make: "Chevrolet",
        model: "Equinox",
        trim: "SLT",
        engine: "1.5L L4",
        bodyStyle: "SUV",
      },
    );
    expect(patch.year).toBeUndefined();
    expect(patch.make).toBeUndefined();
    expect(patch.trim).toBeUndefined();
    expect(patch.model).toBe("Equinox");
    expect(patch.engine).toBe("1.5L L4");
    expect(filled).toEqual(["model", "bodyStyle", "engine"]);
    expect(skipped).toEqual(["year", "make", "trim"]);
  });

  it("skips vPIC when the current NIV was already decoded", () => {
    expect(
      vehicleNeedsVinDecode({
        vin: "1GNEVHKW0RJ123456",
        vinDecodedAt: new Date(),
        vinDecodedVin: "1GNEVHKW0RJ123456",
        engine: null,
      }),
    ).toBe(false);
    expect(
      vehicleNeedsVinDecode({
        vin: "1GNEVHKW0RJ123456",
        vinDecodedAt: null,
        engine: null,
      }),
    ).toBe(true);
  });

  it("applies decode results to empty form strings only", () => {
    const { next, filled } = fillEmptyStringFieldsFromVinDecode(
      { year: "2024", make: "", model: "Terrain" },
      { vin: "1GKS2BKC1FR123456", year: 2020, make: "GMC", model: "Yukon" },
    );
    expect(next.year).toBe("2024");
    expect(next.make).toBe("GMC");
    expect(next.model).toBe("Terrain");
    expect(filled).toEqual(["make"]);
  });

  it("retries only network and HTTP vPIC failures", () => {
    expect(isRetryableVinDecodeError("NHTSA API error: 503")).toBe(true);
    expect(isRetryableVinDecodeError("VIN decode failed")).toBe(true);
    expect(isRetryableVinDecodeError("Invalid VIN format. Must be 17 characters.")).toBe(
      false,
    );
    expect(isRetryableVinDecodeError("1 - Check Digit")).toBe(false);
  });
});

describe("Carfax listing mention", () => {
  it("adds the text-only mention for used and demo vehicles, never for new", () => {
    expect(
      shouldIncludeCarfaxMention({
        mileage: 12000,
        sourceUrl: "https://www.buckinghamgm.com/occasion/terrain.html",
      }),
    ).toBe(true);
    expect(
      shouldIncludeCarfaxMention({
        stockNumber: "X-DEMO",
        sourceUrl: "https://www.buckinghamgm.com/demonstrateurs/envision.html",
      }),
    ).toBe(true);
    expect(
      shouldIncludeCarfaxMention({
        condition: "New",
        mileage: 12,
        stockNumber: "N-NEUF",
        sourceUrl: "https://www.buckinghamgm.com/neufs/trax.html",
      }),
    ).toBe(false);
    expect(
      generateTemplateDescription({
        year: 2024,
        make: "GMC",
        model: "Terrain",
        mileage: 20000,
        price: 28995,
      }),
    ).toContain(CARFAX_MENTION_FR);
    expect(
      generateTemplateDescription({
        year: 2026,
        make: "Chevrolet",
        model: "Trax",
        condition: "New",
        mileage: 8,
        stockNumber: "N-NEUF",
        sourceUrl: "https://www.buckinghamgm.com/neufs/trax.html",
        price: 28995,
      }),
    ).not.toMatch(/carfax/i);
  });

  it("substitutes sourceUrl only when the option is on, and never duplicates", () => {
    const url = "https://www.buckinghamgm.com/occasion/terrain.html";
    expect(
      carfaxMentionFr({
        mileage: 10000,
        sourceUrl: url,
        includeCarfaxSourceUrl: true,
      }),
    ).toBe(`Rapport Carfax gratuit disponible : ${url}`);
    expect(
      carfaxMentionFr({
        mileage: 10000,
        sourceUrl: url,
        includeCarfaxSourceUrl: false,
      }),
    ).toBe(CARFAX_MENTION_FR);
    const once = ensureCarfaxMention("Annonce.", {
      mileage: 10000,
    });
    expect(once).toContain(CARFAX_MENTION_FR);
    expect(appendCarfaxMention(once, CARFAX_MENTION_FR)).toBe(once);
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

describe("Marketplace draft schema", () => {
  it("accepts a complete salesperson draft", () => {
    const draft = updateMarketplaceDraftSchema.parse({
      title: "2025 GMC Terrain — prêt pour la route",
      description:
        "Voici mon GMC Terrain 2025 disponible dès maintenant. Écrivez-moi sur Messenger pour obtenir tous les détails et réserver votre essai routier personnalisé.",
      photoOrder: ["https://example.com/terrain.jpg"],
    });

    expect(draft.title).toContain("GMC Terrain");
    expect(draft.photoOrder).toHaveLength(1);
  });

  it("rejects descriptions too short for a useful Marketplace ad", () => {
    expect(() =>
      updateMarketplaceDraftSchema.parse({
        title: "2025 GMC Terrain",
        description: "Disponible dès maintenant.",
      }),
    ).toThrow();
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
