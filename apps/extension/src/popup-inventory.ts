import { normalizeVin } from "@okauto/shared";

export type PopupVehicle = {
  id: string;
  vin?: string | null;
  stockNumber?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  mileage?: number | null;
  price?: number | null;
  photoCount?: number | null;
  hasActiveListing?: boolean;
};

export function vehicleHeading(vehicle: PopupVehicle): string {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");
}

export function vehicleSearchHaystack(vehicle: PopupVehicle): string {
  return [
    vehicle.stockNumber,
    vehicle.vin,
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.trim,
  ]
    .filter((value) => value != null && String(value).trim() !== "")
    .join(" ")
    .toLocaleLowerCase("fr-CA");
}

export function filterVehicles<T extends PopupVehicle>(
  vehicles: T[],
  query: string,
): T[] {
  const raw = query.trim();
  if (!raw) return vehicles;
  const lowered = raw.toLocaleLowerCase("fr-CA");
  const compact = raw.replace(/[\s-]/g, "").toUpperCase();

  return vehicles.filter((vehicle) => {
    if (vehicleSearchHaystack(vehicle).includes(lowered)) return true;
    if (vehicle.vin && normalizeVin(vehicle.vin).includes(compact)) return true;
    if (
      vehicle.stockNumber &&
      vehicle.stockNumber.toUpperCase().includes(compact)
    ) {
      return true;
    }
    return false;
  });
}

export function formatVehicleMeta(vehicle: PopupVehicle): string {
  return [
    vehicle.stockNumber ? `Stock ${vehicle.stockNumber}` : null,
    `${vehicle.mileage?.toLocaleString("fr-CA") ?? "—"} km`,
    `${vehicle.price?.toLocaleString("fr-CA") ?? "—"} $ CA`,
    vehicle.photoCount ? `${vehicle.photoCount} photos` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function formatVehicleVin(vehicle: PopupVehicle): string | null {
  const vin = vehicle.vin?.trim();
  return vin ? `NIV ${vin}` : null;
}
