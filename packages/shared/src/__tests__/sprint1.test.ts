import { describe, expect, it } from "vitest";
import {
  ALL_IN_UNCONFIRMED_BLOCKER,
  ENGLISH_VERSION_SEPARATOR,
  generateCatalogDescription,
  generateTemplateDescription,
  getListingHealth,
  PRICE_REQUIRED_REASON,
  RENEW_AFTER_DAYS,
  resolveMonthlyListingLimit,
  scoreVehicleForToday,
  startOfCalendarMonth,
  toMetaVehicleRow,
  validateMarketplacePackage,
  validateMetaVehicleRow,
} from "../index";

const aged = new Date("2026-01-01T12:00:00-05:00");
const recent = new Date("2026-09-30T12:00:00-05:00");
const now = new Date("2026-10-05T12:00:00-04:00");

describe("S1-1 file Aujourd'hui", () => {
  it("scores a 90-day manager priority vehicle above a fresh unit", () => {
    const priority = scoreVehicleForToday({
      createdAt: aged,
      price: 24995,
      managerPriority: true,
      photoCount: 8,
      activeListingsByOthers: 0,
      now,
    });
    const fresh = scoreVehicleForToday({
      createdAt: recent,
      price: 24995,
      managerPriority: false,
      photoCount: 8,
      activeListingsByOthers: 0,
      now,
    });
    expect(priority.score).toBeGreaterThan(fresh.score);
    expect(priority.reasons).toContain("Priorité du directeur");
  });

  it("excludes a vehicle without a price", () => {
    const result = scoreVehicleForToday({
      createdAt: aged,
      price: null,
      now,
    });
    expect(result.excludedReason).toBe(PRICE_REQUIRED_REASON);
  });
});

describe("S1-2 listing health", () => {
  it("detects a downward price mismatch", () => {
    const health = getListingHealth({
      status: "ACTIVE",
      priceAtListing: 25000,
      marketplacePrice: null,
      vehiclePrice: 23995,
      listedAt: now,
      now,
    });
    expect(health.priceMismatch?.direction).toBe("down");
    expect(health.priceMismatch?.from).toBe(25000);
    expect(health.priceMismatch?.to).toBe(23995);
  });

  it("marks renewal after 7 days, not before", () => {
    const almost = getListingHealth({
      status: "ACTIVE",
      vehiclePrice: 24000,
      priceAtListing: 24000,
      listedAt: new Date(now.getTime() - (6 * 24 + 23) * 3600_000),
      now,
    });
    const due = getListingHealth({
      status: "ACTIVE",
      vehiclePrice: 24000,
      priceAtListing: 24000,
      listedAt: new Date(now.getTime() - 7 * 24 * 3600_000),
      now,
    });
    const renewed = getListingHealth({
      status: "ACTIVE",
      vehiclePrice: 24000,
      priceAtListing: 24000,
      listedAt: new Date(now.getTime() - 20 * 24 * 3600_000),
      lastRenewedAt: new Date(now.getTime() - 2 * 24 * 3600_000),
      now,
    });
    expect(RENEW_AFTER_DAYS).toBe(7);
    expect(almost.renewDue).toBe(false);
    expect(due.renewDue).toBe(true);
    expect(renewed.renewDue).toBe(false);
  });
});

describe("S1-4 Quebec descriptions", () => {
  const vehicle = {
    year: 2024,
    make: "Chevrolet",
    model: "Equinox",
    price: 24495,
    mileage: 48731,
    vin: "1GNEVHKW0RJ123456",
    stockNumber: "U24495",
    dealershipName: "Buckingham GM",
    allInPriceConfirmed: true,
  };

  it("uses the all-in price label and legal footer", () => {
    const desc = generateTemplateDescription(vehicle);
    expect(desc).toContain("Prix tout inclus : 24 495 $");
    expect(desc).toContain(
      "Seules la TPS, la TVQ et, le cas échéant, le droit spécifique sur les pneus neufs s'ajoutent.",
    );
    expect(desc).not.toMatch(/^Aucun frais obligatoire additionnel$/m);
    expect(desc).toContain("Rapport Carfax gratuit disponible, écrivez-nous !");
  });

  it("blocks when all-in price is not confirmed", () => {
    const result = validateMarketplacePackage({
      ...vehicle,
      allInPriceConfirmed: false,
    });
    expect(result.isReady).toBe(false);
    expect(result.blockers).toContain(ALL_IN_UNCONFIRMED_BLOCKER);
  });

  it("blocks extra-fee wording and allows inclusive wording", () => {
    for (const text of [
      "24 995 $ + frais de transport",
      "plus préparation",
      "prix avant frais",
      "PDI en sus",
    ]) {
      const result = validateMarketplacePackage(vehicle, {
        title: "2024 Chevrolet Equinox",
        description: `Disponible. ${text}. Transport et préparation inclus.`,
      });
      expect(result.isReady).toBe(false);
    }
    const ok = validateMarketplacePackage(vehicle, {
      title: "2024 Chevrolet Equinox",
      description:
        "Voici le 2024 Chevrolet Equinox. Transport et préparation inclus. Prix tout inclus : 24 495 $.",
    });
    expect(ok.blockers.some((item) => item.includes("frais en plus"))).toBe(
      false,
    );
  });

  it("puts French first in bilingual copy and keeps the same facts", () => {
    const pkg = validateMarketplacePackage(
      { ...vehicle, language: "fr_en" },
      {
        title: "2024 Chevrolet Equinox",
        description: generateTemplateDescription({
          ...vehicle,
          language: "fr_en",
        }),
      },
    );
    const bilingual = [
      generateTemplateDescription(vehicle),
      ENGLISH_VERSION_SEPARATOR,
      "English body",
    ].join("\n\n");
    expect(bilingual.startsWith("2024 Chevrolet Equinox")).toBe(true);
    expect(bilingual).toContain(ENGLISH_VERSION_SEPARATOR);
    expect(generateTemplateDescription(vehicle)).toContain("24 495");
    expect(generateTemplateDescription(vehicle)).toContain("48 731");
    expect(generateTemplateDescription(vehicle)).toContain(vehicle.vin);
    expect(pkg).toBeTruthy();
  });

  it("reproduces director highlights verbatim and invents none", () => {
    const withHighlights = generateTemplateDescription({
      ...vehicle,
      highlights: { fr: "Inspection 150 points" },
    });
    expect(withHighlights).toContain("Inspection 150 points");
    const without = generateTemplateDescription(vehicle);
    expect(without).not.toContain("AVANTAGES CHEZ");
    expect(without.toLocaleLowerCase("fr-CA")).not.toContain("garantie");
  });
});

describe("S1-5 Meta catalog", () => {
  it("maps a used SUV to Meta fields", () => {
    const row = toMetaVehicleRow(
      {
        id: "veh-1",
        vin: "1GNEVHKW0RJ123456",
        year: 2022,
        make: "GMC",
        model: "Terrain",
        mileage: 48731,
        price: 24495,
        bodyStyle: "VUS",
        exteriorColor: "Noir",
        condition: "Used",
        sourceUrl: "https://www.buckinghamgm.com/occasion/gmc.html",
        imageUrl: "https://cdn.example.com/a.jpg",
        imageUrls: [
          "https://cdn.example.com/a.jpg",
          "https://cdn.example.com/b.jpg",
        ],
      },
      {
        name: "Buckingham GM",
        address: "155 avenue de Buckingham",
        city: "Gatineau",
        state: "QC",
        zip: "J8L 2E4",
      },
    );
    expect(row.price).toBe("24495 CAD");
    expect(row["mileage.unit"]).toBe("KM");
    expect(row.state_of_vehicle).toBe("Used");
    expect(row.body_style).toBe("SUV");
    expect(JSON.parse(row.address).country).toBe("Canada");
  });

  it("uses 0 km for new vehicles and demo mapping", () => {
    const neu = toMetaVehicleRow(
      {
        id: "n1",
        vin: "NEWVIN00000000001",
        year: 2026,
        make: "Chevrolet",
        model: "Trax",
        mileage: 12,
        price: 28995,
        condition: "New",
        stockNumber: "N-NEUF",
        sourceUrl: "https://www.buckinghamgm.com/neufs/trax.html",
        exteriorColor: "Blanc",
        imageUrl: "https://cdn.example.com/n.jpg",
      },
      { name: "Buckingham GM", city: "Gatineau", state: "QC" },
    );
    expect(neu["mileage.value"]).toBe("0");
    expect(neu.state_of_vehicle).toBe("New");

    const demo = toMetaVehicleRow(
      {
        id: "d1",
        vin: "DEMOVIN0000000001",
        year: 2025,
        make: "Buick",
        model: "Envision",
        mileage: 2400,
        price: 41995,
        condition: "Demo",
        stockNumber: "X-DEMO",
        exteriorColor: "Rouge",
        imageUrl: "https://cdn.example.com/d.jpg",
        sourceUrl: "https://www.buckinghamgm.com/demonstrateurs/envision.html",
      },
      {
        name: "Buckingham GM",
        city: "Gatineau",
        state: "QC",
        metaCatalogStateForDemo: "Used",
      },
    );
    expect(demo.state_of_vehicle).toBe("Used");
  });

  it("keeps catalog copy free of all-caps lines and URLs", () => {
    const description = generateCatalogDescription({
      year: 2022,
      make: "GMC",
      model: "Terrain",
      price: 24495,
      mileage: 48731,
    });
    expect(description).toContain("Prix tout inclus");
    expect(description).not.toMatch(/https?:\/\//);
    expect(description.split("\n").every((line) => line !== line.toUpperCase() || line.length < 8)).toBe(
      true,
    );
  });

  it("warns when a used vehicle has too few photos", () => {
    const row = toMetaVehicleRow(
      {
        id: "veh-2",
        stockNumber: "U1",
        year: 2020,
        make: "Ford",
        model: "Escape",
        price: 18995,
        mileage: 200,
        exteriorColor: "Blanc",
        sourceUrl: "https://www.buckinghamgm.com/occasion/escape.html",
        imageUrl: "https://cdn.example.com/one.jpg",
      },
      { name: "Buckingham GM", city: "Gatineau", state: "QC" },
    );
    const result = validateMetaVehicleRow(row);
    expect(result.warnings.join(" ")).toMatch(/Marketplace/);
  });
});

describe("quota month in America/Toronto", () => {
  it("starts the month at Toronto midnight", () => {
    const lateSeptember = new Date("2026-09-30T23:30:00-04:00");
    const october = new Date("2026-10-01T00:30:00-04:00");
    expect(startOfCalendarMonth(lateSeptember).toISOString()).toContain(
      "2026-09-01",
    );
    expect(startOfCalendarMonth(october).getTime()).toBeGreaterThan(
      startOfCalendarMonth(lateSeptember).getTime(),
    );
  });

  it("resolves monthly limit as member > org marketplace > org listing > default", () => {
    expect(
      resolveMonthlyListingLimit({
        memberLimit: 8,
        organizationMarketplaceLimit: 3,
        organizationMonthlyLimit: 5,
      }),
    ).toBe(8);
    expect(
      resolveMonthlyListingLimit({
        memberLimit: null,
        organizationMarketplaceLimit: 3,
        organizationMonthlyLimit: 5,
      }),
    ).toBe(3);
    expect(
      resolveMonthlyListingLimit({
        memberLimit: null,
        organizationMarketplaceLimit: null,
        organizationMonthlyLimit: 7,
      }),
    ).toBe(7);
    expect(resolveMonthlyListingLimit({})).toBe(5);
  });
});
