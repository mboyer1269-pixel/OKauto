import {
  computeQuebecAdvertisedPrice,
  mergePricingFees,
  type PricingFees,
} from "./pricing";

export type ListingLocale = "fr" | "en" | "bilingual";

export interface VehicleData {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  mileage?: number | null;
  price?: number | null;
  advertisedPrice?: number | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  transmission?: string | null;
  fuelType?: string | null;
  drivetrain?: string | null;
  engine?: string | null;
  bodyStyle?: string | null;
  condition?: string | null;
  features?: string[];
  dealershipName?: string;
  contactName?: string;
  phone?: string;
  vin?: string | null;
  stockNumber?: string | null;
  sourceUrl?: string | null;
  location?: string | null;
  locale?: ListingLocale | null;
  language?: "fr" | "fr_en" | null;
  organizationFees?: PricingFees | null;
  vehicleFees?: PricingFees | null;
  allInPriceConfirmed?: boolean;
  highlights?: { fr?: string; en?: string } | null;
}

export interface MarketplacePackage {
  title: string;
  description: string;
  titleEn: string;
  descriptionEn: string;
  advertisedPrice: number | null;
  locale: ListingLocale;
  isReady: boolean;
  blockers: string[];
  warnings: string[];
}

const frenchNumber = new Intl.NumberFormat("fr-CA");
const frenchCurrency = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const englishNumber = new Intl.NumberFormat("en-CA");
const englishCurrency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

function cleanValue(value?: string | null): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function inlineValue(value?: string | null): string {
  return cleanValue(value).replace(/[.!]+$/, "");
}

function joinList(values: string[], locale: "fr" | "en"): string {
  if (values.length < 2) return values[0] ?? "";
  const conjunction = locale === "fr" ? "et" : "and";
  return `${values.slice(0, -1).join(", ")} ${conjunction} ${values[values.length - 1]}`;
}

function uniqueFeatures(features: string[] = []): string[] {
  const seen = new Set<string>();

  return features.map(cleanValue).filter((feature) => {
    if (!feature) return false;
    const key = feature.toLocaleLowerCase("fr-CA");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function classifyInventoryKind(
  vehicle: VehicleData,
): "new" | "demo" | "used" | null {
  const condition = cleanValue(vehicle.condition).toLocaleLowerCase("fr-CA");
  const stockNumber = cleanValue(vehicle.stockNumber).toLocaleUpperCase(
    "fr-CA",
  );
  const sourceUrl = cleanValue(vehicle.sourceUrl).toLocaleLowerCase("fr-CA");

  if (
    condition.includes("demo") ||
    stockNumber.includes("-DEMO") ||
    sourceUrl.includes("/demonstrateurs/")
  ) {
    return "demo";
  }
  if (sourceUrl.includes("/occasion/")) return "used";
  if (
    stockNumber.includes("-NEUF") ||
    sourceUrl.includes("/neufs/") ||
    ((condition === "new" || condition === "neuf") &&
      (vehicle.mileage == null || vehicle.mileage <= 1_000))
  ) {
    return "new";
  }
  return vehicle.mileage != null ? "used" : null;
}

export const ALL_IN_PRICE_VIOLATIONS: RegExp[] = [
  /\+\s*(frais|transport|pr[ée]p|admin)/i,
  /(plus|en sus|extra)\s+(les\s+)?(frais|transport|pr[ée]paration|livraison|administration)/i,
  /prix\s+avant\s+frais/i,
  /\bPDI\b/,
  /frais\s+d['’]administration\s+(en sus|non inclus|additionnels?)/i,
];

export const CREDIT_AD_WARNING =
  /\$\s*\/\s*(mois|sem)|par (mois|semaine)|taux\s+de\s+\d/i;

export const ALL_IN_PRICE_BLOCKER =
  "Le texte laisse entendre des frais en plus du prix. Au Québec, le prix annoncé doit être tout inclus (LPC, art. 224 c); OPC).";

export const ALL_IN_UNCONFIRMED_BLOCKER =
  "Prix tout inclus non confirmé par la direction (Paramètres > Conformité).";

export const ENGLISH_VERSION_SEPARATOR = "— English version —";

export function resolveListingLocale(
  value?: string | null,
): ListingLocale {
  if (value === "en" || value === "bilingual") return value;
  if (value === "fr_en") return "bilingual";
  return "fr";
}

export function listingHasAllInPriceViolation(text: string): boolean {
  return ALL_IN_PRICE_VIOLATIONS.some((pattern) => pattern.test(text));
}

export function advertisedPriceFor(vehicle: VehicleData): number | null {
  if (vehicle.advertisedPrice != null && vehicle.advertisedPrice > 0) {
    return vehicle.advertisedPrice;
  }
  const breakdown = computeQuebecAdvertisedPrice(
    vehicle.price,
    mergePricingFees(vehicle.organizationFees, vehicle.vehicleFees),
  );
  return breakdown?.advertisedPrice ?? vehicle.price ?? null;
}

function generateHumanIntro(
  vehicle: VehicleData,
  title: string,
  dealershipName: string,
): string[] {
  const vehicleTitle = title || "ce véhicule";
  const kind = classifyInventoryKind(vehicle);
  const availability = dealershipName ? ` chez ${dealershipName}` : "";
  const lines = [
    kind === "new"
      ? `Voici le ${vehicleTitle} neuf que j’ai présentement en inventaire${availability}.`
      : kind === "demo"
        ? `Je vous présente ce ${vehicleTitle} démonstrateur, présentement disponible${availability}.`
        : kind === "used"
          ? `Voici le ${vehicleTitle} d’occasion que j’ai présentement en inventaire${availability}.`
          : `J’ai présentement ce ${vehicleTitle} en inventaire${availability}.`,
  ];

  const configuration = [
    inlineValue(vehicle.engine)
      ? `un moteur ${inlineValue(vehicle.engine)}`
      : null,
    inlineValue(vehicle.transmission)
      ? `une transmission ${inlineValue(vehicle.transmission)}`
      : null,
    inlineValue(vehicle.drivetrain)
      ? `un rouage ${inlineValue(vehicle.drivetrain).toLocaleLowerCase("fr-CA")}`
      : null,
  ].filter((value): value is string => Boolean(value));

  if (configuration.length) {
    lines.push(`Sa configuration comprend ${joinList(configuration, "fr")}.`);
  }

  const exteriorColor = cleanValue(vehicle.exteriorColor);
  const interiorColor = cleanValue(vehicle.interiorColor);
  if (exteriorColor && interiorColor) {
    lines.push(
      `La présentation combine ${exteriorColor} à l’extérieur et ${interiorColor} à l’intérieur.`,
    );
  } else if (exteriorColor) {
    lines.push(`Il est présenté dans la couleur ${exteriorColor}.`);
  }

  return lines;
}

function generateHumanIntroEn(
  vehicle: VehicleData,
  title: string,
  dealershipName: string,
): string[] {
  const vehicleTitle = title || "this vehicle";
  const kind = classifyInventoryKind(vehicle);
  const availability = dealershipName ? ` at ${dealershipName}` : "";
  const lines = [
    kind === "new"
      ? `Here is the new ${vehicleTitle} I currently have in stock${availability}.`
      : kind === "demo"
        ? `This is our ${vehicleTitle} demonstrator, available now${availability}.`
        : kind === "used"
          ? `Here is the pre-owned ${vehicleTitle} I currently have in stock${availability}.`
          : `I currently have this ${vehicleTitle} in stock${availability}.`,
  ];

  const configuration = [
    inlineValue(vehicle.engine)
      ? `${inlineValue(vehicle.engine)} engine`
      : null,
    inlineValue(vehicle.transmission)
      ? `${inlineValue(vehicle.transmission)} transmission`
      : null,
    inlineValue(vehicle.drivetrain)
      ? `${inlineValue(vehicle.drivetrain)} drivetrain`
      : null,
  ].filter((value): value is string => Boolean(value));

  if (configuration.length) {
    lines.push(`It is equipped with ${joinList(configuration, "en")}.`);
  }

  const exteriorColor = cleanValue(vehicle.exteriorColor);
  const interiorColor = cleanValue(vehicle.interiorColor);
  if (exteriorColor && interiorColor) {
    lines.push(
      `The presentation pairs ${exteriorColor} outside with ${interiorColor} inside.`,
    );
  } else if (exteriorColor) {
    lines.push(`It is shown in ${exteriorColor}.`);
  }

  return lines;
}

export function generateListingTitle(vehicle: VehicleData): string {
  const parts = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .map((value) => cleanValue(value == null ? "" : String(value)))
    .filter(Boolean);
  return parts.join(" ");
}

function legalFooterFr(priceLabel: string | null): string {
  const mention =
    "Prix tout inclus : transport, préparation et frais d'administration compris. Seules la TPS, la TVQ et, le cas échéant, le droit spécifique sur les pneus neufs s'ajoutent.";
  return priceLabel ? `Prix tout inclus : ${priceLabel}. ${mention}` : mention;
}

function legalFooterEn(priceLabel: string | null): string {
  const mention =
    "All-in price: freight, prep and administration included. Only GST, QST and, if applicable, the Quebec new-tire fee are extra.";
  return priceLabel ? `All-in price: ${priceLabel}. ${mention}` : mention;
}

export function generateTemplateDescription(vehicle: VehicleData): string {
  const title = generateListingTitle(vehicle);
  const dealershipName = cleanValue(vehicle.dealershipName);
  const contactName = cleanValue(vehicle.contactName);
  const phone = cleanValue(vehicle.phone);
  const location = cleanValue(vehicle.location);
  const displayPrice = advertisedPriceFor(vehicle);
  const lines: string[] = [title || "Véhicule à vendre"];

  const highlights = [
    displayPrice != null ? frenchCurrency.format(displayPrice) : null,
    vehicle.mileage != null
      ? `${frenchNumber.format(vehicle.mileage)} km`
      : null,
  ].filter((value): value is string => Boolean(value));

  if (highlights.length) lines.push(highlights.join(" • "));
  if (displayPrice != null) {
    lines.push(`Prix tout inclus : ${frenchCurrency.format(displayPrice)}`);
  }

  lines.push("", ...generateHumanIntro(vehicle, title, dealershipName));

  const details = [
    cleanValue(vehicle.exteriorColor)
      ? `Couleur extérieure : ${cleanValue(vehicle.exteriorColor)}`
      : null,
    cleanValue(vehicle.interiorColor)
      ? `Couleur intérieure : ${cleanValue(vehicle.interiorColor)}`
      : null,
    cleanValue(vehicle.transmission)
      ? `Transmission : ${cleanValue(vehicle.transmission)}`
      : null,
    cleanValue(vehicle.fuelType)
      ? `Carburant : ${cleanValue(vehicle.fuelType)}`
      : null,
    cleanValue(vehicle.drivetrain)
      ? `Rouage : ${cleanValue(vehicle.drivetrain)}`
      : null,
    cleanValue(vehicle.engine)
      ? `Moteur : ${cleanValue(vehicle.engine)}`
      : null,
    cleanValue(vehicle.bodyStyle)
      ? `Carrosserie : ${cleanValue(vehicle.bodyStyle)}`
      : null,
  ].filter((line): line is string => Boolean(line));

  if (details.length) {
    lines.push(
      "",
      "LA FICHE EN BREF",
      ...details.map((detail) => `• ${detail}`),
    );
  }

  const features = uniqueFeatures(vehicle.features).slice(0, 8);
  if (features.length) {
    lines.push(
      "",
      "ÉQUIPEMENTS QUI RESSORTENT",
      ...features.map((feature) => `• ${feature}`),
    );
  }

  const highlightFr = cleanValue(vehicle.highlights?.fr);
  if (highlightFr) {
    lines.push(
      "",
      `AVANTAGES CHEZ ${dealershipName || "NOUS"}`,
      highlightFr,
    );
  }

  lines.push("", "INTÉRESSÉ PAR CE VÉHICULE?");

  if (contactName) {
    lines.push(
      `Écrivez-moi directement ici sur Messenger — ${contactName} — et je vous répondrai personnellement.`,
      phone
        ? `Vous pouvez aussi m’appeler directement à la concession au ${phone} et demander ${contactName}.`
        : `Vous pouvez aussi appeler directement à la concession et demander ${contactName}.`,
      "Je pourrai confirmer la disponibilité, répondre à vos questions et planifier votre visite ou votre essai routier.",
    );
  } else {
    lines.push(
      "Écrivez-nous directement sur Marketplace pour vérifier la disponibilité, poser vos questions ou planifier une visite et un essai routier.",
    );
    if (phone) lines.push(`Téléphone : ${phone}`);
  }

  if (location) lines.push(`Emplacement : ${location}`);

  const references = [
    cleanValue(vehicle.stockNumber)
      ? `stock ${cleanValue(vehicle.stockNumber)}`
      : null,
    cleanValue(vehicle.vin) ? `NIV ${cleanValue(vehicle.vin)}` : null,
  ].filter((value): value is string => Boolean(value));
  if (references.length)
    lines.push("", `Référence : ${references.join(" • ")}`);

  lines.push(
    "",
    "Disponibilité et informations à confirmer auprès du concessionnaire.",
    legalFooterFr(
      displayPrice != null ? frenchCurrency.format(displayPrice) : null,
    ),
  );

  return lines.join("\n");
}

export function generateTemplateDescriptionEn(vehicle: VehicleData): string {
  const title = generateListingTitle(vehicle);
  const dealershipName = cleanValue(vehicle.dealershipName);
  const contactName = cleanValue(vehicle.contactName);
  const phone = cleanValue(vehicle.phone);
  const location = cleanValue(vehicle.location);
  const displayPrice = advertisedPriceFor(vehicle);
  const lines: string[] = [title || "Vehicle for sale"];

  const highlights = [
    displayPrice != null ? englishCurrency.format(displayPrice) : null,
    vehicle.mileage != null
      ? `${englishNumber.format(vehicle.mileage)} km`
      : null,
  ].filter((value): value is string => Boolean(value));

  if (highlights.length) lines.push(highlights.join(" • "));
  if (displayPrice != null) {
    lines.push(`All-in price: ${englishCurrency.format(displayPrice)}`);
  }

  lines.push("", ...generateHumanIntroEn(vehicle, title, dealershipName));

  const details = [
    cleanValue(vehicle.exteriorColor)
      ? `Exterior colour: ${cleanValue(vehicle.exteriorColor)}`
      : null,
    cleanValue(vehicle.interiorColor)
      ? `Interior colour: ${cleanValue(vehicle.interiorColor)}`
      : null,
    cleanValue(vehicle.transmission)
      ? `Transmission: ${cleanValue(vehicle.transmission)}`
      : null,
    cleanValue(vehicle.fuelType)
      ? `Fuel: ${cleanValue(vehicle.fuelType)}`
      : null,
    cleanValue(vehicle.drivetrain)
      ? `Drivetrain: ${cleanValue(vehicle.drivetrain)}`
      : null,
    cleanValue(vehicle.engine) ? `Engine: ${cleanValue(vehicle.engine)}` : null,
    cleanValue(vehicle.bodyStyle)
      ? `Body style: ${cleanValue(vehicle.bodyStyle)}`
      : null,
  ].filter((line): line is string => Boolean(line));

  if (details.length) {
    lines.push("", "QUICK SPECS", ...details.map((detail) => `• ${detail}`));
  }

  const features = uniqueFeatures(vehicle.features).slice(0, 8);
  if (features.length) {
    lines.push(
      "",
      "STAND-OUT EQUIPMENT",
      ...features.map((feature) => `• ${feature}`),
    );
  }

  const highlightEn = cleanValue(vehicle.highlights?.en);
  if (highlightEn) {
    lines.push(
      "",
      `WHY BUY FROM ${dealershipName || "US"}`,
      highlightEn,
    );
  }

  lines.push("", "INTERESTED IN THIS VEHICLE?");

  if (contactName) {
    lines.push(
      `Message me here on Messenger — ${contactName} — and I will reply personally.`,
      phone
        ? `You can also call the dealership at ${phone} and ask for ${contactName}.`
        : `You can also call the dealership and ask for ${contactName}.`,
      "I can confirm availability, answer your questions and book a visit or test drive.",
    );
  } else {
    lines.push(
      "Message us on Marketplace to confirm availability, ask questions or book a visit and test drive.",
    );
    if (phone) lines.push(`Phone: ${phone}`);
  }

  if (location) lines.push(`Location: ${location}`);

  const references = [
    cleanValue(vehicle.stockNumber)
      ? `stock ${cleanValue(vehicle.stockNumber)}`
      : null,
    cleanValue(vehicle.vin) ? `VIN ${cleanValue(vehicle.vin)}` : null,
  ].filter((value): value is string => Boolean(value));
  if (references.length) lines.push("", `Reference: ${references.join(" • ")}`);

  lines.push(
    "",
    "Availability and details to be confirmed with the dealership.",
    legalFooterEn(
      displayPrice != null ? englishCurrency.format(displayPrice) : null,
    ),
  );

  return lines.join("\n");
}

export function composeListingDescription(
  vehicle: VehicleData,
  locale: ListingLocale = "fr",
): string {
  const french = generateTemplateDescription(vehicle);
  if (locale === "fr") return french;
  const english = generateTemplateDescriptionEn(vehicle);
  if (locale === "en") return english;
  return `${french}\n\n${ENGLISH_VERSION_SEPARATOR}\n\n${english}`;
}

export function generateCatalogDescription(vehicle: VehicleData): string {
  const title = generateListingTitle(vehicle);
  const displayPrice = advertisedPriceFor(vehicle);
  const sentences = [
    title ? `${title} disponible en concession.` : "Véhicule disponible en concession.",
    displayPrice != null
      ? `Prix tout inclus : ${frenchCurrency.format(displayPrice)}.`
      : null,
    vehicle.mileage != null
      ? `Kilométrage : ${frenchNumber.format(vehicle.mileage)} km.`
      : classifyInventoryKind(vehicle) === "new"
        ? "Véhicule neuf, 0 km."
        : null,
    cleanValue(vehicle.exteriorColor)
      ? `Couleur extérieure : ${cleanValue(vehicle.exteriorColor)}.`
      : null,
    cleanValue(vehicle.vin) ? `NIV ${cleanValue(vehicle.vin)}.` : null,
    "Prix tout inclus : transport, préparation et frais d'administration compris. Seules la TPS, la TVQ et, le cas échéant, le droit spécifique sur les pneus neufs s'ajoutent.",
  ].filter((line): line is string => Boolean(line));
  return sentences.join(" ").slice(0, 5000);
}

export function validateMarketplacePackage(
  vehicle: VehicleData,
  draft?: { title?: string; description?: string },
): Pick<MarketplacePackage, "isReady" | "blockers" | "warnings"> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const condition = vehicle.condition?.toLowerCase() ?? "";
  const isUsed =
    condition.includes("used") ||
    condition.includes("usag") ||
    vehicle.mileage != null;

  if (!generateListingTitle(vehicle))
    blockers.push("Année, marque et modèle requis.");
  if (advertisedPriceFor(vehicle) == null || (advertisedPriceFor(vehicle) ?? 0) <= 0)
    blockers.push("Prix de vente requis.");
  if (isUsed && vehicle.mileage == null)
    blockers.push("Kilométrage requis pour un véhicule usagé.");
  if (vehicle.allInPriceConfirmed === false) {
    blockers.push(ALL_IN_UNCONFIRMED_BLOCKER);
  }
  const title = draft?.title ?? generateMarketplaceTitle(vehicle);
  const description =
    draft?.description ??
    composeListingDescription(vehicle, resolveListingLocale(vehicle.language ?? vehicle.locale));
  if (listingHasAllInPriceViolation(`${title}\n${description}`)) {
    blockers.push(ALL_IN_PRICE_BLOCKER);
  }
  if (CREDIT_AD_WARNING.test(description)) {
    warnings.push(
      "Publicité de crédit : des mentions obligatoires s'appliquent. Retirez la mensualité ou faites valider le texte par la direction.",
    );
  }
  const locale = resolveListingLocale(vehicle.language ?? vehicle.locale);
  if (locale === "bilingual") {
    const [french = "", english = ""] = description.split(ENGLISH_VERSION_SEPARATOR);
    if (!description.includes(ENGLISH_VERSION_SEPARATOR) || !description.trim().startsWith(french.trim().slice(0, 20))) {
      warnings.push(
        "La version française doit être au moins équivalente à l'anglaise (OQLF).",
      );
    } else if (english.trim().length > french.trim().length * 1.2) {
      warnings.push(
        "La version française doit être au moins équivalente à l'anglaise (OQLF).",
      );
    }
  }
  if (!vehicle.stockNumber) warnings.push("Numéro de stock manquant.");
  if (!vehicle.vin) warnings.push("NIV manquant.");
  if (!vehicle.dealershipName)
    warnings.push("Nom du concessionnaire manquant.");
  if (!vehicle.contactName)
    warnings.push("Nom du conseiller Marketplace manquant.");

  return { isReady: blockers.length === 0, blockers, warnings };
}

export function generateMarketplacePackage(
  vehicle: VehicleData,
  locale: ListingLocale = resolveListingLocale(vehicle.language ?? vehicle.locale),
): MarketplacePackage {
  const description = composeListingDescription(vehicle, locale);
  const title = generateMarketplaceTitle(vehicle);
  const validation = validateMarketplacePackage(vehicle, { title, description });
  return {
    title,
    description,
    titleEn: generateMarketplaceTitle(vehicle),
    descriptionEn: generateTemplateDescriptionEn(vehicle),
    advertisedPrice: advertisedPriceFor(vehicle),
    locale,
    ...validation,
  };
}

export function generateMarketplaceTitle(vehicle: VehicleData): string {
  return generateListingTitle(vehicle).slice(0, 100);
}
