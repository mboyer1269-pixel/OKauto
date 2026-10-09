import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendCarfaxMention,
  CARFAX_MENTION_EN,
  CARFAX_MENTION_FR,
  carfaxMentionFr,
  carfaxSourceUrlCheckboxState,
  ensureCarfaxMention,
  generateListingTitle,
  generateMarketplacePackage,
  generateMarketplaceTitle,
  generateTemplateDescription,
  listingDescriptionForExtension,
  listingDescriptionMeetsMinLength,
  listingDescriptionWithCarfax,
  listingEditorDescription,
  shouldIncludeCarfaxMention,
} from "../description";
import {
  createAccessRequestSchema,
  createListingSchema,
  createVehicleSchema,
  isFacebookMarketplaceItemUrl,
  loginSchema,
  registerSchema,
  updateMarketplaceDraftSchema,
} from "../index";
import {
  VIN_DECODE_FETCH_TIMEOUT_MS,
  VPIC_SUV_BODY_CLASS,
  canAcceptPartialVinDecode,
  decodeVin,
  emptyFieldsFromVinDecode,
  fillEmptyStringFieldsFromVinDecode,
  isRetryableVinDecodeError,
  isRetryableVinDecodeFailure,
  isValidVinFormat,
  isVinSourcedField,
  mapVpicTransmission,
  mergeDealerFieldsOverVinDecode,
  mergeVinDecodeIntoForm,
  normalizeVin,
  normalizeVinDecodeResult,
  vehicleNeedsVinDecode,
  vinDecodeStampFromCreate,
} from "../vin";
import {
  VIN_DECODE_RETRY_DELAYS_MS,
  vinDecodeBackoffWhere,
  vinDecodeReadyForRetry,
  vinDecodeRetryDelayMs,
} from "../job-policy";

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

  it("retries fetch failed, timeouts, invalid JSON, 429 and 5xx — not check-digit", () => {
    expect(isRetryableVinDecodeError("fetch failed")).toBe(true);
    expect(isRetryableVinDecodeError("fetch failed (ENOTFOUND)")).toBe(true);
    expect(
      isRetryableVinDecodeError("The operation was aborted due to timeout"),
    ).toBe(true);
    expect(isRetryableVinDecodeError("Unexpected token '<'")).toBe(true);
    expect(isRetryableVinDecodeError("NHTSA API error: 429")).toBe(true);
    expect(isRetryableVinDecodeError("NHTSA API error: 503")).toBe(true);
    expect(isRetryableVinDecodeError("NHTSA API error: 404")).toBe(false);
    expect(isRetryableVinDecodeError("Invalid VIN format. Must be 17 characters.")).toBe(
      false,
    );
    expect(isRetryableVinDecodeError("1 - Check Digit")).toBe(false);
    const fetchFailed = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNRESET" },
    });
    expect(isRetryableVinDecodeFailure(fetchFailed)).toBe(true);
    expect(isRetryableVinDecodeFailure(new SyntaxError("Unexpected token '<'"))).toBe(
      true,
    );
  });

  it("normalizes vPIC SUV dumps into French dealer vocab within schema limits", () => {
    const terrain = normalizeVinDecodeResult({
      vin: "2GKALMEK1R6123456",
      year: 2024,
      make: "CHEVROLET",
      model: "Terrain",
      bodyStyle: VPIC_SUV_BODY_CLASS,
      fuelType: "Gasoline",
      transmission: "Automatic",
      drivetrain: "AWD/All-Wheel Drive",
    });
    const equinox = normalizeVinDecodeResult({
      vin: "2GNAXKEV0L6123456",
      year: 2020,
      make: "CHEVROLET",
      model: "Equinox",
      bodyStyle: VPIC_SUV_BODY_CLASS,
      fuelType: "Gasoline",
      transmission: "Automatic",
      drivetrain: "FWD/Front-Wheel Drive",
    });
    expect(terrain.bodyStyle).toBe("VUS");
    expect(terrain.fuelType).toBe("Essence");
    expect(terrain.transmission).toBe("Automatique");
    expect(terrain.drivetrain).toBe("Intégrale");
    expect(terrain.make).toBe("Chevrolet");
    expect(equinox.drivetrain).toBe("Traction avant");
    expect(mapVpicTransmission("Manual")).toBe("Manuelle");
    expect(mapVpicTransmission("Automatic")).toBe("Automatique");
    expect(VPIC_SUV_BODY_CLASS.length).toBeGreaterThan(50);
    expect(createVehicleSchema.safeParse(terrain).success).toBe(true);
    expect(createVehicleSchema.safeParse(equinox).success).toBe(true);
  });

  it("accepts partial vPIC codes 8 and 14 when year, make and model are present", () => {
    expect(canAcceptPartialVinDecode([8, 14], 2025, "CHEVROLET", "Trax")).toBe(
      true,
    );
    expect(canAcceptPartialVinDecode([4, 14], 2025, "CHEVROLET", "Trax")).toBe(
      true,
    );
    expect(canAcceptPartialVinDecode([1], 2025, "CHEVROLET", "Trax")).toBe(false);
    expect(canAcceptPartialVinDecode([14], undefined, "CHEVROLET", "Trax")).toBe(
      false,
    );
  });

  it("rejects a stale decode when the NIV changed during the request", () => {
    const stale = mergeVinDecodeIntoForm(
      { vin: "1GNEVHKW0RJ123456", make: "", model: "Saisi" },
      { vin: "1GKS2BKC1FR123456", make: "GMC", model: "Yukon" },
    );
    expect(stale.ignored).toBe(true);
    expect(stale.next.model).toBe("Saisi");
    const live = mergeVinDecodeIntoForm(
      { vin: "1GKS2BKC1FR123456", make: "", model: "Saisi" },
      { vin: "1GKS2BKC1FR123456", make: "GMC", model: "Yukon" },
    );
    expect(live.ignored).toBe(false);
    expect(live.next.make).toBe("GMC");
    expect(live.next.model).toBe("Saisi");
  });

  it("maps Automatic and Automated Manual to the same Automatique label", () => {
    expect(mapVpicTransmission("Automatic")).toBe("Automatique");
    expect(mapVpicTransmission("Automated Manual")).toBe("Automatique");
    expect(mapVpicTransmission("Automated Manual Transmission")).toBe(
      "Automatique",
    );
    expect(mapVpicTransmission("Manuelle robotisée")).toBe("Automatique");
    expect(mapVpicTransmission("Manual")).toBe("Manuelle");
  });

  it("never lets an empty site value overwrite a vPIC field, but a filled site value wins", () => {
    const current = {
      engine: "5.3L V8",
      make: "GMC",
      vinDecodedFields: ["engine"],
    };
    const emptySite = mergeDealerFieldsOverVinDecode(current, {
      engine: null,
      make: "",
    });
    expect(emptySite.patch.engine).toBeUndefined();
    expect(emptySite.patch.make).toBeNull();
    expect(emptySite.vinDecodedFields).toEqual(["engine"]);

    const dealerEngine = mergeDealerFieldsOverVinDecode(current, {
      engine: "2.0L turbo",
    });
    expect(dealerEngine.patch.engine).toBe("2.0L turbo");
    expect(dealerEngine.vinDecodedFields).toEqual([]);

    const omitted = mergeDealerFieldsOverVinDecode(current, {
      engine: undefined,
    });
    expect(omitted.patch.engine).toBeUndefined();
    expect(omitted.vinDecodedFields).toEqual(["engine"]);
  });

  it("clears dealer fields when vinDecodedFields is empty, even if the NIV is stamped", () => {
    const current = {
      engine: "5.3L V8",
      trim: "AT4",
      make: "GMC",
      vinDecodedAt: "2026-10-09T12:00:00.000Z",
      vinDecodedFields: [],
    };
    const cleared = mergeDealerFieldsOverVinDecode(current, {
      engine: "",
      trim: null,
      make: "GMC",
    });
    expect(cleared.patch.engine).toBeNull();
    expect(cleared.patch.trim).toBeNull();
    expect(cleared.patch.make).toBe("GMC");
    expect(cleared.vinDecodedFields).toEqual([]);
    expect(isVinSourcedField(current, "engine")).toBe(false);
    expect(isVinSourcedField(current, "trim")).toBe(false);
  });

  it("spaces retryable vPIC failures 15 min, then 1 h, 6 h and 24 h", () => {
    expect(vinDecodeRetryDelayMs(1)).toBe(15 * 60 * 1000);
    expect(vinDecodeRetryDelayMs(2)).toBe(60 * 60 * 1000);
    expect(vinDecodeRetryDelayMs(3)).toBe(6 * 60 * 60 * 1000);
    expect(vinDecodeRetryDelayMs(4)).toBe(24 * 60 * 60 * 1000);
    expect(VIN_DECODE_RETRY_DELAYS_MS).toHaveLength(4);
    const now = new Date("2026-10-09T12:00:00.000Z");
    expect(
      vinDecodeReadyForRetry(1, new Date("2026-10-09T11:50:00.000Z"), now),
    ).toBe(false);
    expect(
      vinDecodeReadyForRetry(1, new Date("2026-10-09T11:44:00.000Z"), now),
    ).toBe(true);
    expect(
      vinDecodeReadyForRetry(2, new Date("2026-10-09T11:01:00.000Z"), now),
    ).toBe(false);
    expect(
      vinDecodeReadyForRetry(2, new Date("2026-10-09T11:00:00.000Z"), now),
    ).toBe(true);
    const where = vinDecodeBackoffWhere(now);
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { vinDecodeAttempts: { lte: 0 } },
        { vinDecodeLastAttemptAt: null },
        {
          vinDecodeAttempts: 1,
          vinDecodeLastAttemptAt: {
            lte: new Date(now.getTime() - 15 * 60 * 1000),
          },
        },
        {
          vinDecodeAttempts: 4,
          vinDecodeLastAttemptAt: {
            lte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          },
        },
      ]),
    );
    expect(where.OR).toHaveLength(6);
  });

  it("stamps vinDecodedAt on create only when the form already decoded the NIV", () => {
    const stamped = vinDecodeStampFromCreate({
      vin: "1GNEVHKW0RJ123456",
      vinDecoded: true,
    });
    expect(stamped.vinDecodedVin).toBe("1GNEVHKW0RJ123456");
    expect(stamped.vinDecodedAt).toBeInstanceOf(Date);
    expect(
      vinDecodeStampFromCreate({ vin: "1GNEVHKW0RJ123456", vinDecoded: false }),
    ).toEqual({});
  });
});

describe("decodeVin network failures", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("treats Node 22 fetch failed as retryable and never returns decoded fields", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new TypeError("fetch failed"), {
          cause: { code: "ENOTFOUND" },
        });
      }),
    );
    const result = await decodeVin("1GNEVHKW0RJ123456");
    expect(result.error).toMatch(/fetch failed/i);
    expect(result.retryable).toBe(true);
    expect(result.make).toBeUndefined();
    expect(result.model).toBeUndefined();
    expect(timeoutSpy).toHaveBeenCalledWith(VIN_DECODE_FETCH_TIMEOUT_MS);
  });

  it("treats an HTML 200 page as retryable invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token '<'");
        },
      })),
    );
    const result = await decodeVin("1GNEVHKW0RJ123456");
    expect(result.retryable).toBe(true);
    expect(result.error).toMatch(/Unexpected token/i);
    expect(result.bodyStyle).toBeUndefined();
  });

  it("maps a live Equinox-style vPIC payload through French limits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          Results: [
            { Variable: "Error Code", Value: "0" },
            { Variable: "Model Year", Value: "2020" },
            { Variable: "Make", Value: "CHEVROLET" },
            { Variable: "Model", Value: "Equinox" },
            { Variable: "Body Class", Value: VPIC_SUV_BODY_CLASS },
            { Variable: "Fuel Type - Primary", Value: "Gasoline" },
            { Variable: "Transmission Style", Value: "Automatic" },
            { Variable: "Drive Type", Value: "FWD/Front-Wheel Drive" },
          ],
        }),
      })),
    );
    const result = await decodeVin("2GNAXKEV0L6123456");
    expect(result.error).toBeUndefined();
    expect(createVehicleSchema.safeParse(result).success).toBe(true);
    expect(result.bodyStyle).toBe("VUS");
    expect(result.make).toBe("Chevrolet");
  });

  it("keeps year/make/model on vPIC error codes 8 and 14", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          Results: [
            { Variable: "Error Code", Value: "4,14" },
            { Variable: "Error Text", Value: "Unable to provide information" },
            { Variable: "Model Year", Value: "2025" },
            { Variable: "Make", Value: "CHEVROLET" },
            { Variable: "Model", Value: "Trax" },
            { Variable: "Body Class", Value: VPIC_SUV_BODY_CLASS },
          ],
        }),
      })),
    );
    const result = await decodeVin("KL77LJE05SC123456");
    expect(result.error).toBeUndefined();
    expect(result.year).toBe(2025);
    expect(result.model).toBe("Trax");
    expect(result.bodyStyle).toBe("VUS");
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
    expect(
      shouldIncludeCarfaxMention({
        condition: "New",
        mileage: 12,
        year: 2026,
        make: "Chevrolet",
        model: "Trax",
      }),
    ).toBe(false);
  });

  it("shows the effective org-or-vehicle Carfax link state on the checkbox", () => {
    expect(carfaxSourceUrlCheckboxState(true, false)).toEqual({
      checked: true,
      lockedByOrganization: true,
    });
    expect(carfaxSourceUrlCheckboxState(false, true)).toEqual({
      checked: true,
      lockedByOrganization: false,
    });
    expect(carfaxSourceUrlCheckboxState(false, false)).toEqual({
      checked: false,
      lockedByOrganization: false,
    });
  });

  it("applies ensureCarfaxMention to an existing Marketplace draft", () => {
    const draft = "Voici mon GMC Terrain 2025 disponible chez nous.";
    const withMention = listingDescriptionForExtension(draft, {
      mileage: 12000,
      year: 2025,
      make: "GMC",
      model: "Terrain",
    });
    expect(withMention).toContain(draft);
    expect(withMention).toContain(CARFAX_MENTION_FR);
    expect(
      listingDescriptionWithCarfax(draft, {
        mileage: 12000,
        year: 2025,
        make: "GMC",
        model: "Terrain",
      }),
    ).toBe(withMention);
    expect(
      listingDescriptionForExtension(withMention, {
        mileage: 12000,
      }),
    ).toBe(withMention);
    expect(
      listingDescriptionWithCarfax(draft, {
        condition: "New",
        mileage: 12,
        year: 2026,
        make: "Chevrolet",
        model: "Trax",
      }),
    ).not.toMatch(/carfax/i);
  });

  it("keeps an emptied editor description empty instead of regenerating the template", () => {
    const generated = generateTemplateDescription({
      mileage: 12000,
      year: 2025,
      make: "GMC",
      model: "Terrain",
    });
    expect(listingEditorDescription("", generated, generated)).toBe("");
    expect(listingEditorDescription("", generated, generated)).not.toContain(
      "Terrain",
    );
  });

  it("does not duplicate Carfax when the mention is edited in the editor", () => {
    const vehicle = {
      mileage: 12000,
      year: 2025,
      make: "GMC",
      model: "Terrain",
    };
    const generated = generateTemplateDescription(vehicle);
    const edited = generated.replace(
      CARFAX_MENTION_FR,
      "Rapport Carfax modifié pour cet essai.",
    );
    expect(listingEditorDescription(edited, generated, generated)).toBe(edited);
    expect(
      (listingEditorDescription(edited, generated, generated).match(/carfax/gi) ??
        []).length,
    ).toBe(1);
    const published = listingDescriptionWithCarfax(edited, vehicle);
    expect(published.match(/carfax/gi) ?? []).toHaveLength(1);
    expect(published).toContain("Rapport Carfax modifié pour cet essai.");
    expect(published).not.toContain(CARFAX_MENTION_FR);
  });

  it("rejects Belle auto. before appending the Carfax mention", () => {
    expect(listingDescriptionMeetsMinLength("Belle auto.")).toBe(false);
    const published = listingDescriptionWithCarfax("Belle auto.", {
      mileage: 12000,
      year: 2025,
      make: "GMC",
      model: "Terrain",
    });
    expect(published).toContain("Belle auto.");
    expect(published).toContain(CARFAX_MENTION_FR);
  });

  it("keeps one French and one English Carfax line in bilingual copy", () => {
    const bilingual = generateMarketplacePackage(
      {
        year: 2024,
        make: "GMC",
        model: "Terrain",
        mileage: 20000,
        price: 28995,
        language: "fr_en",
      },
      "bilingual",
    );
    expect(bilingual.description).toContain(CARFAX_MENTION_FR);
    expect(bilingual.description).toContain(CARFAX_MENTION_EN);
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

describe("access request schema", () => {
  const valid = {
    name: "Patrice Gagnon",
    dealership: "Buckingham Chevrolet Buick GMC",
    email: "  Patrice@Concession.example ",
    phone: "819-555-0100",
    message: "Nous aimerions essayer Suivia Auto.",
    consent: true as const,
  };

  it("accepte une demande complète et normalise le courriel", () => {
    expect(createAccessRequestSchema.parse(valid)).toEqual({
      name: "Patrice Gagnon",
      dealership: "Buckingham Chevrolet Buick GMC",
      email: "patrice@concession.example",
      phone: "819-555-0100",
      message: "Nous aimerions essayer Suivia Auto.",
      consent: true,
    });
  });

  it("accepte un téléphone vide et refuse un consentement absent", () => {
    expect(
      createAccessRequestSchema.parse({ ...valid, phone: "  " }).phone,
    ).toBeUndefined();
    expect(() =>
      createAccessRequestSchema.parse({ ...valid, consent: false }),
    ).toThrow();
    expect(() =>
      createAccessRequestSchema.parse({ ...valid, consent: undefined }),
    ).toThrow();
    expect(() =>
      createAccessRequestSchema.parse({ ...valid, email: "pas-un-courriel" }),
    ).toThrow();
    expect(() =>
      createAccessRequestSchema.parse({ ...valid, name: "" }),
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
