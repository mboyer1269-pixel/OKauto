import type { VehicleInput } from "./schemas.js";

export interface DescriptionOptions {
  dealershipName?: string;
  city?: string;
  complianceFooter?: string;
}

export function buildListingTitle(vehicle: VehicleInput): string {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildMarketplaceDescription(
  vehicle: VehicleInput,
  options: DescriptionOptions = {}
): string {
  const title = buildListingTitle(vehicle);
  const highlights = [
    vehicle.mileage !== undefined ? `${vehicle.mileage.toLocaleString()} miles` : undefined,
    vehicle.exteriorColor ? `${vehicle.exteriorColor} exterior` : undefined,
    vehicle.interiorColor ? `${vehicle.interiorColor} interior` : undefined,
    vehicle.transmission,
    vehicle.drivetrain,
    vehicle.fuelType
  ].filter(Boolean);

  const featureLine =
    vehicle.features.length > 0
      ? `Highlighted features include ${vehicle.features.slice(0, 8).join(", ")}.`
      : "Contact the dealership for a full walkaround, availability, and feature confirmation.";

  const dealership = options.dealershipName ?? "our dealership";
  const city = options.city ? ` in ${options.city}` : "";
  const price =
    vehicle.price !== undefined
      ? `Listed at $${vehicle.price.toLocaleString()}.`
      : "Contact us for current pricing.";

  const footer =
    options.complianceFooter ??
    "Availability, mileage, pricing, taxes, title, registration, and fees should be verified with the dealership before purchase.";

  return [
    `${title} available now from ${dealership}${city}.`,
    price,
    highlights.length > 0 ? `Quick details: ${highlights.join(" | ")}.` : undefined,
    featureLine,
    vehicle.notes,
    "Message the dealership to schedule a test drive, request more photos, or confirm current availability.",
    footer
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildPhotoChecklist(photoCount: number): string[] {
  const checklist = [
    "Front three-quarter exterior",
    "Rear three-quarter exterior",
    "Driver cockpit",
    "Odometer and dashboard",
    "Front seats",
    "Rear seats or cargo area",
    "Wheels and tire tread",
    "VIN plate or window sticker when appropriate"
  ];

  if (photoCount >= checklist.length) {
    return ["Photo coverage looks complete. Confirm images are current and vehicle-specific."];
  }

  return checklist.slice(photoCount);
}
