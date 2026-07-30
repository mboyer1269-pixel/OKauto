import type { SyncAdapter, SyncVehicle } from '../types';

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      // skip malformed blocks
    }
  }
  return blocks;
}

function vehicleFromJsonLd(item: Record<string, unknown>): SyncVehicle | null {
  const type = String(item['@type'] ?? '').toLowerCase();
  if (!type.includes('vehicle') && !type.includes('car') && !type.includes('product')) return null;

  const vin = (item.vehicleIdentificationNumber ?? item.vin ?? item.sku) as string | undefined;
  if (!vin || vin.length < 11) return null;

  const offers = item.offers as Record<string, unknown> | undefined;
  const price = offers?.price != null ? Number(offers.price) : item.price != null ? Number(item.price) : null;

  const images = item.image ?? item.photo;
  const photoUrls = Array.isArray(images)
    ? images.filter((i): i is string => typeof i === 'string')
    : typeof images === 'string'
      ? [images]
      : undefined;

  const brand = item.brand as Record<string, unknown> | string | undefined;
  const make = typeof brand === 'string' ? brand : (brand?.name as string | undefined);

  return {
    vin,
    stockNumber: item.sku as string | undefined,
    year: item.vehicleModelDate != null ? Number(item.vehicleModelDate) : item.modelDate != null ? Number(item.modelDate) : null,
    make,
    model: (item.model ?? item.name) as string | undefined,
    mileage: item.mileageFromOdometer != null
      ? Number((item.mileageFromOdometer as Record<string, unknown>)?.value ?? item.mileageFromOdometer)
      : null,
    price,
    exteriorColor: item.color as string | undefined,
    description: item.description as string | undefined,
    fuelType: item.fuelType as string | undefined,
    transmission: item.vehicleTransmission as string | undefined,
    drivetrain: item.driveWheelConfiguration as string | undefined,
    engine: item.vehicleEngine as string | undefined,
    bodyStyle: item.bodyType as string | undefined,
    photos: photoUrls,
    status: 'AVAILABLE',
  };
}

export const jsonLdAdapter: SyncAdapter = {
  name: 'json-ld',
  parse(body: string): SyncVehicle[] {
    const blocks = extractJsonLdBlocks(body);
    const vehicles: SyncVehicle[] = [];

    for (const block of blocks) {
      if (Array.isArray(block)) {
        for (const item of block) {
          const v = vehicleFromJsonLd(item as Record<string, unknown>);
          if (v) vehicles.push(v);
        }
      } else if (block && typeof block === 'object') {
        const obj = block as Record<string, unknown>;
        if (Array.isArray(obj['@graph'])) {
          for (const item of obj['@graph'] as unknown[]) {
            const v = vehicleFromJsonLd(item as Record<string, unknown>);
            if (v) vehicles.push(v);
          }
        } else {
          const v = vehicleFromJsonLd(obj);
          if (v) vehicles.push(v);
        }
      }
    }

    // Deduplicate by VIN
    const seen = new Set<string>();
    return vehicles.filter((v) => {
      if (!v.vin || seen.has(v.vin)) return false;
      seen.add(v.vin);
      return true;
    });
  },
};
