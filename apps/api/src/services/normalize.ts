import {
  decodeVin,
  jsonFeedItemSchema,
  normalizeVin,
  type BodyStyle,
  type Drivetrain,
  type FuelType,
  type Transmission,
  type VehicleCondition,
  BODY_STYLES,
  DRIVETRAINS,
  FUEL_TYPES,
  TRANSMISSIONS,
  VEHICLE_CONDITIONS,
} from "@okauto/shared";
import type { z } from "zod";

export type FeedItemInput = z.input<typeof jsonFeedItemSchema>;

export interface NormalizedVehicle {
  vin: string | null;
  stockNumber: string | null;
  externalId: string | null;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  bodyStyle: BodyStyle | null;
  fuelType: FuelType | null;
  transmission: Transmission | null;
  drivetrain: Drivetrain | null;
  mileage: number | null;
  priceCents: number;
  currency: string;
  condition: VehicleCondition;
  exteriorColor: string | null;
  interiorColor: string | null;
  description: string | null;
  photoUrls: string[];
  warnings: string[];
}

export type NormalizeResult =
  | { ok: true; vehicle: NormalizedVehicle }
  | { ok: false; error: string };

function coerceEnum<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : null;
}

function cleanText(value: string | null | undefined, max = 200): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function normalizeFeedItem(raw: FeedItemInput, maxPhotos: number): NormalizeResult {
  const warnings: string[] = [];

  const priceCents =
    raw.priceCents ?? (raw.price != null ? Math.round(raw.price * 100) : undefined);
  if (priceCents == null || priceCents < 0) {
    return { ok: false, error: "Missing or invalid price (priceCents or price required)" };
  }

  const make = cleanText(raw.make, 60);
  const model = cleanText(raw.model, 80);
  if (!make || !model) return { ok: false, error: "make and model are required" };

  let vin: string | null = null;
  let year = raw.year ?? null;
  let resolvedMake = make;
  if (raw.vin) {
    const normalized = normalizeVin(raw.vin);
    if (normalized.length > 0) {
      const decoded = decodeVin(normalized);
      if (decoded.valid) {
        vin = decoded.vin;
        year = year ?? decoded.modelYear ?? null;
        if (!raw.make && decoded.wmiMake) resolvedMake = decoded.wmiMake;
        if (decoded.wmiMake && make.toLowerCase() !== decoded.wmiMake.toLowerCase()) {
          warnings.push(`VIN WMI suggests ${decoded.wmiMake}; kept feed make "${make}"`);
        }
      } else {
        warnings.push(`Invalid VIN ignored (${decoded.errors.join("; ") || "format"})`);
      }
    }
  }

  const photoUrls = (raw.photoUrls ?? raw.photos ?? [])
    .filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u))
    .slice(0, maxPhotos);
  if ((raw.photoUrls?.length ?? raw.photos?.length ?? 0) > photoUrls.length) {
    warnings.push("Some photos were dropped (invalid URL or over limit)");
  }

  const stockNumber = cleanText(raw.stockNumber, 40);
  if (!vin && !stockNumber) {
    return { ok: false, error: "A valid VIN or a stock number is required for deduplication" };
  }

  return {
    ok: true,
    vehicle: {
      vin,
      stockNumber,
      externalId: cleanText(raw.externalId, 120),
      year,
      make: resolvedMake,
      model,
      trim: cleanText(raw.trim),
      bodyStyle: coerceEnum<BodyStyle>(raw.bodyStyle, BODY_STYLES),
      fuelType: coerceEnum<FuelType>(raw.fuelType, FUEL_TYPES),
      transmission: coerceEnum<Transmission>(raw.transmission, TRANSMISSIONS),
      drivetrain: coerceEnum<Drivetrain>(raw.drivetrain, DRIVETRAINS),
      mileage: raw.mileage ?? null,
      priceCents,
      currency: (raw.currency ?? "USD").toUpperCase(),
      condition: coerceEnum<VehicleCondition>(raw.condition, VEHICLE_CONDITIONS) ?? "USED",
      exteriorColor: cleanText(raw.exteriorColor, 60),
      interiorColor: cleanText(raw.interiorColor, 60),
      description: raw.description ? raw.description.slice(0, 9000) : null,
      photoUrls,
      warnings,
    },
  };
}
