import type { SyncAdapter, SyncVehicle } from '../types';

/** Common dealer DMS / website JSON feed format */
export const dealerJsonAdapter: SyncAdapter = {
  name: 'dealer-json',
  parse(body: string): SyncVehicle[] {
    const data = JSON.parse(body) as Record<string, unknown>;
    const items =
      (data.inventory as unknown[]) ??
      (data.usedInventory as unknown[]) ??
      (data.newInventory as unknown[]) ??
      (data.results as unknown[]) ??
      [];

    if (!Array.isArray(items)) return [];

    const vehicles: SyncVehicle[] = [];
    for (const item of items) {
      const raw = item as Record<string, unknown>;
      const vin = (raw.vin ?? raw.vehicleVin ?? raw.VIN) as string | undefined;
      if (!vin) continue;

      const images = raw.images ?? raw.photos ?? raw.media;
      const photoUrls = Array.isArray(images)
        ? images
            .map((img) =>
              typeof img === 'string' ? img : (img as { url?: string; href?: string })?.url ?? (img as { href?: string })?.href
            )
            .filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
        : undefined;

      const statusRaw = String(raw.status ?? raw.availability ?? 'available').toLowerCase();
      const status =
        statusRaw.includes('sold') ? 'SOLD' : statusRaw.includes('pending') ? 'PENDING' : 'AVAILABLE';

      vehicles.push({
        vin,
        stockNumber: (raw.stockNumber ?? raw.stock ?? raw.stockNo) as string | undefined,
        year: Number(raw.year ?? raw.modelYear) || null,
        make: (raw.make ?? raw.manufacturer) as string | undefined,
        model: raw.model as string | undefined,
        trim: (raw.trim ?? raw.series) as string | undefined,
        mileage: raw.mileage != null ? Number(raw.mileage) : raw.odometer != null ? Number(raw.odometer) : null,
        price: raw.price != null ? Number(raw.price) : raw.internetPrice != null ? Number(raw.internetPrice) : null,
        exteriorColor: (raw.exteriorColor ?? raw.extColor ?? raw.color) as string | undefined,
        interiorColor: (raw.interiorColor ?? raw.intColor) as string | undefined,
        description: (raw.description ?? raw.comments) as string | undefined,
        transmission: raw.transmission as string | undefined,
        fuelType: (raw.fuelType ?? raw.fuel) as string | undefined,
        drivetrain: (raw.drivetrain ?? raw.driveType) as string | undefined,
        engine: raw.engine as string | undefined,
        bodyStyle: (raw.bodyStyle ?? raw.bodyType) as string | undefined,
        status,
        photos: photoUrls,
      });
    }

    return vehicles;
  },
};
