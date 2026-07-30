import type { CapturePayload, VehicleInput } from "./schemas.js";

export function normalizeWhitespace(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : undefined;
}

export function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || key === "fbclid" || key === "gclid") {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.toString();
}

export function normalizeVin(value: string | undefined): string | undefined {
  return normalizeWhitespace(value)?.toUpperCase();
}

export function normalizeVehicle(input: VehicleInput): VehicleInput {
  return {
    ...input,
    vin: normalizeVin(input.vin),
    stockNumber: normalizeWhitespace(input.stockNumber),
    make: normalizeWhitespace(input.make) ?? input.make,
    model: normalizeWhitespace(input.model) ?? input.model,
    trim: normalizeWhitespace(input.trim),
    bodyStyle: normalizeWhitespace(input.bodyStyle),
    drivetrain: normalizeWhitespace(input.drivetrain),
    transmission: normalizeWhitespace(input.transmission),
    fuelType: normalizeWhitespace(input.fuelType),
    exteriorColor: normalizeWhitespace(input.exteriorColor),
    interiorColor: normalizeWhitespace(input.interiorColor),
    location: normalizeWhitespace(input.location),
    features: [...new Set(input.features.map((feature) => feature.trim()).filter(Boolean))],
    notes: normalizeWhitespace(input.notes)
  };
}

export function normalizeCapturePayload(payload: CapturePayload): CapturePayload {
  return {
    ...payload,
    sourceUrl: canonicalizeUrl(payload.sourceUrl),
    vehicle: normalizeVehicle(payload.vehicle),
    photos: [...new Set(payload.photos)]
  };
}

export function vehicleIdentityKey(vehicle: VehicleInput): string {
  if (vehicle.vin) {
    return `vin:${vehicle.vin}`;
  }

  const parts = [
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.trim ?? "",
    vehicle.mileage ? Math.round(vehicle.mileage / 1000) * 1000 : "unknown"
  ];
  return `vehicle:${parts.join(":").toLowerCase()}`;
}

export function isLikelyDuplicate(existing: VehicleInput, incoming: VehicleInput): boolean {
  if (existing.vin && incoming.vin) {
    return existing.vin === incoming.vin;
  }

  const sameModel =
    existing.year === incoming.year &&
    existing.make.toLowerCase() === incoming.make.toLowerCase() &&
    existing.model.toLowerCase() === incoming.model.toLowerCase() &&
    (existing.trim ?? "").toLowerCase() === (incoming.trim ?? "").toLowerCase();

  if (!sameModel) {
    return false;
  }

  if (existing.stockNumber && incoming.stockNumber) {
    return existing.stockNumber.toLowerCase() === incoming.stockNumber.toLowerCase();
  }

  if (existing.mileage !== undefined && incoming.mileage !== undefined) {
    return Math.abs(existing.mileage - incoming.mileage) <= 500;
  }

  return true;
}
