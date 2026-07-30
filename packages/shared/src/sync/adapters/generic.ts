import type { SyncAdapter, SyncVehicle } from '../types';

function normalizeVehicle(raw: Record<string, unknown>): SyncVehicle | null {
  const vin = (raw.vin ?? raw.VIN ?? raw.Vin) as string | undefined;
  if (!vin || typeof vin !== 'string' || vin.length < 11) return null;

  const photos = raw.photos ?? raw.images ?? raw.photoUrls;
  const photoUrls = Array.isArray(photos)
    ? photos.map((p) => (typeof p === 'string' ? p : (p as { url?: string })?.url)).filter(Boolean) as string[]
    : undefined;

  return {
    vin,
    stockNumber: (raw.stockNumber ?? raw.stock ?? raw.stockNo) as string | undefined,
    year: Number(raw.year) || null,
    make: (raw.make ?? raw.Make) as string | undefined,
    model: (raw.model ?? raw.Model) as string | undefined,
    trim: (raw.trim ?? raw.Trim) as string | undefined,
    mileage: raw.mileage != null ? Number(raw.mileage) : raw.odometer != null ? Number(raw.odometer) : null,
    price: raw.price != null ? Number(raw.price) : raw.salePrice != null ? Number(raw.salePrice) : null,
    exteriorColor: (raw.exteriorColor ?? raw.color ?? raw.exterior) as string | undefined,
    interiorColor: raw.interiorColor as string | undefined,
    description: raw.description as string | undefined,
    transmission: raw.transmission as string | undefined,
    fuelType: (raw.fuelType ?? raw.fuel) as string | undefined,
    drivetrain: raw.drivetrain as string | undefined,
    engine: raw.engine as string | undefined,
    bodyStyle: (raw.bodyStyle ?? raw.body) as string | undefined,
    status: raw.status as string | undefined,
    photos: photoUrls,
  };
}

export const genericAdapter: SyncAdapter = {
  name: 'generic',
  parse(body: string): SyncVehicle[] {
    const data = JSON.parse(body) as unknown;
    const items = Array.isArray(data)
      ? data
      : (data as Record<string, unknown>).vehicles ??
        (data as Record<string, unknown>).inventory ??
        (data as Record<string, unknown>).data ??
        [];

    if (!Array.isArray(items)) return [];

    return items
      .map((item) => normalizeVehicle(item as Record<string, unknown>))
      .filter((v): v is SyncVehicle => v !== null);
  },
};
