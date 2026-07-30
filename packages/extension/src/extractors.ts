import { CapturePayloadSchema, type CapturePayload } from "@okauto/shared";

export interface ExtractedVehicle {
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  vin?: string;
  stockNumber?: string;
  mileage?: number;
  price?: number;
  exteriorColor?: string;
  interiorColor?: string;
  features: string[];
  photos: string[];
}

const knownMakes = [
  "Acura",
  "Audi",
  "BMW",
  "Buick",
  "Cadillac",
  "Chevrolet",
  "Chrysler",
  "Dodge",
  "Ford",
  "GMC",
  "Honda",
  "Hyundai",
  "Jeep",
  "Kia",
  "Lexus",
  "Mazda",
  "Mercedes-Benz",
  "Nissan",
  "Ram",
  "Subaru",
  "Tesla",
  "Toyota",
  "Volkswagen",
  "Volvo"
];

export function numberFromText(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseVehicleFromTitle(title: string): Partial<ExtractedVehicle> {
  const match = title.match(/\b(19[5-9]\d|20[0-4]\d)\b\s+([A-Za-z-]+)\s+([A-Za-z0-9-]+)/);
  if (!match) {
    return {};
  }

  const [, year, make, model] = match;
  return {
    year: Number(year),
    make,
    model
  };
}

export function parseVisibleText(text: string): Partial<ExtractedVehicle> {
  const vin = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i)?.[0]?.toUpperCase();
  const stockNumber = text.match(/\b(?:stock|stk|stock #)\s*:?\s*([A-Za-z0-9-]{2,32})\b/i)?.[1];
  const mileage = numberFromText(text.match(/\b([0-9,]{3,7})\s*(?:miles|mi\.?)\b/i)?.[1]);
  const price = numberFromText(text.match(/\$\s*([0-9,]{3,8})\b/)?.[1]);
  const titleGuess = parseVehicleFromTitle(text);
  const make =
    titleGuess.make ??
    knownMakes.find((candidate) => new RegExp(`\\b${candidate}\\b`, "i").test(text));

  return {
    ...titleGuess,
    make,
    vin,
    stockNumber,
    mileage,
    price
  };
}

export function parseJsonLd(doc: Document): Partial<ExtractedVehicle> {
  const scripts = [...doc.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')];

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent ?? "{}") as unknown;
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const record = node as Record<string, unknown>;
        const type = String(record["@type"] ?? "").toLowerCase();
        if (!type.includes("vehicle") && !type.includes("car") && !record.vehicleIdentificationNumber) {
          continue;
        }

        return {
          vin: typeof record.vehicleIdentificationNumber === "string" ? record.vehicleIdentificationNumber : undefined,
          make: typeof record.brand === "string" ? record.brand : undefined,
          model: typeof record.model === "string" ? record.model : undefined,
          mileage:
            typeof record.mileageFromOdometer === "string"
              ? numberFromText(record.mileageFromOdometer)
              : undefined,
          price:
            typeof record.offers === "object" && record.offers
              ? numberFromText(String((record.offers as Record<string, unknown>).price ?? ""))
              : undefined,
          photos: Array.isArray(record.image)
            ? record.image.filter((image): image is string => typeof image === "string")
            : typeof record.image === "string"
              ? [record.image]
              : []
        };
      }
    } catch {
      continue;
    }
  }

  return {};
}

export function extractCapturePayload(doc: Document, url: string): CapturePayload {
  const jsonLd = parseJsonLd(doc);
  const visible = parseVisibleText(doc.body.innerText);
  const title = parseVehicleFromTitle(doc.title);
  const images = [...doc.images]
    .map((image) => image.currentSrc || image.src)
    .filter((src) => src.startsWith("http"))
    .slice(0, 40);

  const merged: ExtractedVehicle = {
    features: [],
    photos: [],
    ...title,
    ...visible,
    ...jsonLd,
    photos: [...new Set([...(jsonLd.photos ?? []), ...images])]
  };

  const vehicle = {
    year: merged.year ?? new Date().getFullYear(),
    make: merged.make ?? "Unknown",
    model: merged.model ?? "Vehicle",
    trim: merged.trim,
    vin: merged.vin,
    stockNumber: merged.stockNumber,
    mileage: merged.mileage,
    price: merged.price,
    exteriorColor: merged.exteriorColor,
    interiorColor: merged.interiorColor,
    status: "AVAILABLE" as const,
    features: merged.features
  };

  return CapturePayloadSchema.parse({
    sourceUrl: url,
    sourceType: "EXTENSION",
    capturedAt: new Date(),
    vehicle,
    photos: merged.photos,
    rawText: doc.body.innerText.slice(0, 50000),
    adapterVersion: "generic-visible-v1"
  });
}
