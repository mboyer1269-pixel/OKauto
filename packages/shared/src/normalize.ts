import { buildHeaderIndex, pickField } from "./csv.js";
import type {
  BodyStyle, Drivetrain, FuelType, Transmission, VehicleCondition, VehicleInput,
} from "./schemas.js";
import { vehicleInputSchema } from "./schemas.js";
import { normalizeVin } from "./vin.js";

/**
 * Feed/record normalization: maps arbitrary DMS/website export records
 * (CSV rows or JSON objects) into OpenLot's canonical VehicleInput.
 */

const FIELD_ALIASES: Record<string, string[]> = {
  vin: ["vin", "vin number", "vehicle vin"],
  stockNumber: ["stock", "stock number", "stock #", "stocknum", "stock_no"],
  year: ["year", "model year", "yr"],
  make: ["make", "manufacturer", "brand"],
  model: ["model"],
  trim: ["trim", "series", "trim level"],
  bodyStyle: ["body", "body style", "bodystyle", "body type", "vehicle type"],
  condition: ["condition", "new used", "type"],
  mileage: ["mileage", "miles", "odometer", "odo"],
  price: ["price", "selling price", "internet price", "list price", "asking price", "retail price"],
  exteriorColor: ["exterior color", "ext color", "color", "colour", "exterior"],
  interiorColor: ["interior color", "int color", "interior"],
  transmission: ["transmission", "trans"],
  fuelType: ["fuel", "fuel type", "fueltype"],
  drivetrain: ["drivetrain", "drive train", "drive type", "drive"],
  engine: ["engine", "engine description"],
  doors: ["doors", "door count"],
  description: ["description", "comments", "dealer comments", "notes"],
  features: ["features", "options", "equipment"],
  photos: ["photos", "photo urls", "images", "image urls", "photourllist", "imagelist", "picture urls"],
};

export function parseMoneyToCents(raw: string | number | null | undefined): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) : undefined;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return undefined;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 100);
}

export function parseIntSafe(raw: string | number | null | undefined): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw) : undefined;
  const cleaned = raw.replace(/[,\s]/g, "");
  if (cleaned === "") return undefined;
  const value = Number.parseInt(cleaned, 10);
  return Number.isFinite(value) ? value : undefined;
}

export function normalizeBodyStyle(raw: string | undefined): BodyStyle | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (/(suv|sport utility|crossover|cuv)/.test(s)) return "SUV";
  if (/(truck|pickup|pick-up|crew cab|extended cab|regular cab)/.test(s)) return "TRUCK";
  if (/sedan|saloon/.test(s)) return "SEDAN";
  if (/coupe|coupé/.test(s)) return "COUPE";
  if (/convertible|cabriolet|roadster/.test(s)) return "CONVERTIBLE";
  if (/hatch/.test(s)) return "HATCHBACK";
  if (/wagon|estate/.test(s)) return "WAGON";
  if (/minivan|mpv/.test(s)) return "MINIVAN";
  if (/van/.test(s)) return "VAN";
  if (/compact|small/.test(s)) return "SMALL_CAR";
  return "OTHER";
}

export function normalizeTransmission(raw: string | undefined): Transmission | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (/cvt|continuously variable/.test(s)) return "CVT";
  if (/manual|standard|stick|m\/t|\bmt\b/.test(s)) return "MANUAL";
  if (/auto|a\/t|\bat\b/.test(s)) return "AUTOMATIC";
  return "OTHER";
}

export function normalizeFuelType(raw: string | undefined): FuelType | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (/plug.?in/.test(s)) return "PLUGIN_HYBRID";
  if (/hybrid/.test(s)) return "HYBRID";
  if (/diesel/.test(s)) return "DIESEL";
  if (/electric|\bev\b|battery/.test(s)) return "ELECTRIC";
  if (/flex|e85/.test(s)) return "FLEX";
  if (/gas|petrol|unleaded/.test(s)) return "GASOLINE";
  return "OTHER";
}

export function normalizeDrivetrain(raw: string | undefined): Drivetrain | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (/awd|all.?wheel/.test(s)) return "AWD";
  if (/4wd|4x4|four.?wheel/.test(s)) return "FOUR_WD";
  if (/fwd|front/.test(s)) return "FWD";
  if (/rwd|rear/.test(s)) return "RWD";
  return "OTHER";
}

export function normalizeCondition(raw: string | undefined): VehicleCondition | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (/certified|cpo/.test(s)) return "CERTIFIED";
  if (/new/.test(s)) return "NEW";
  if (/used|pre.?owned/.test(s)) return "USED";
  return undefined;
}

function splitList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[|;,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function splitUrlList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[|;,\s\n]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));
}

export interface NormalizationResult {
  ok: boolean;
  vehicle?: VehicleInput;
  errors?: string[];
  rawVin?: string;
}

/** Normalize a CSV record (header-keyed) into a VehicleInput. */
export function normalizeCsvRecord(record: Record<string, string>, headers: string[]): NormalizationResult {
  const index = buildHeaderIndex(headers);
  const get = (field: keyof typeof FIELD_ALIASES) => pickField(record, index, FIELD_ALIASES[field]!);

  const candidate = {
    vin: normalizeVin(get("vin") ?? ""),
    stockNumber: get("stockNumber"),
    year: parseIntSafe(get("year")),
    make: get("make"),
    model: get("model"),
    trim: get("trim"),
    bodyStyle: normalizeBodyStyle(get("bodyStyle")),
    condition: normalizeCondition(get("condition")) ?? "USED",
    mileage: parseIntSafe(get("mileage")),
    priceCents: parseMoneyToCents(get("price")),
    exteriorColor: get("exteriorColor"),
    interiorColor: get("interiorColor"),
    transmission: normalizeTransmission(get("transmission")),
    fuelType: normalizeFuelType(get("fuelType")),
    drivetrain: normalizeDrivetrain(get("drivetrain")),
    engine: get("engine"),
    doors: parseIntSafe(get("doors")),
    description: get("description"),
    features: splitList(get("features")),
    photoUrls: splitUrlList(get("photos")),
    status: "AVAILABLE" as const,
  };

  const parsed = vehicleInputSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      rawVin: candidate.vin || undefined,
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  return { ok: true, vehicle: parsed.data };
}

/** Normalize a JSON feed item (arbitrary keys) into a VehicleInput. */
export function normalizeJsonRecord(item: Record<string, unknown>): NormalizationResult {
  // Reuse the CSV path by stringifying values; arrays are joined with "|".
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(item)) {
    if (value === null || value === undefined) continue;
    record[key] = Array.isArray(value) ? value.map(String).join("|") : String(value);
  }
  return normalizeCsvRecord(record, Object.keys(record));
}
