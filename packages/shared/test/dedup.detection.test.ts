import { describe, expect, it } from 'vitest';
import { buildIndex, findDuplicate } from '../src/dedup.js';
import { detectInventoryChanges, listingsNeedingTakedown } from '../src/detection.js';
import { normalizeVehicle } from '../src/normalize.js';

describe('dedup', () => {
  const existing = [
    { id: 'v1', ...normalizeVehicle({ vin: '1HGCM82633A004352', stockNumber: 'A1', year: 2003, make: 'Honda', model: 'Accord', mileage: 120000 }) },
    { id: 'v2', ...normalizeVehicle({ stockNumber: 'B2', year: 2018, make: 'Toyota', model: 'Camry', mileage: 40000 }) },
  ];
  const index = buildIndex(existing);

  it('matches on VIN', () => {
    const candidate = normalizeVehicle({ vin: '1hgcm82633a004352', year: 2003, make: 'Honda', model: 'Accord' });
    expect(findDuplicate(candidate, index)).toEqual({ reason: 'vin', existingId: 'v1' });
  });

  it('matches on stock number case-insensitively', () => {
    const candidate = normalizeVehicle({ stockNumber: 'b2', year: 2018, make: 'Toyota', model: 'Camry' });
    expect(findDuplicate(candidate, index)).toEqual({ reason: 'stock', existingId: 'v2' });
  });

  it('matches on fuzzy signature only when no VIN', () => {
    const candidate = normalizeVehicle({ year: 2018, make: 'Toyota', model: 'Camry', mileage: 40400 });
    expect(findDuplicate(candidate, index)).toEqual({ reason: 'fuzzy', existingId: 'v2' });
  });

  it('returns null for genuinely new vehicles', () => {
    const candidate = normalizeVehicle({ vin: '5YJ3E1EA7HF000337', year: 2017, make: 'Tesla', model: 'Model 3' });
    expect(findDuplicate(candidate, index)).toBeNull();
  });
});

describe('detection', () => {
  it('detects sold, added, and price changes', () => {
    const previous = [
      { key: 'VIN1', priceCents: 2000000 },
      { key: 'VIN2', priceCents: 3000000 },
      { key: 'VIN3', priceCents: 1500000 },
    ];
    const next = [
      { key: 'VIN2', priceCents: 2800000 }, // price drop
      { key: 'VIN3', priceCents: 1500000, status: 'sold' }, // marked sold
      { key: 'VIN4', priceCents: 4000000 }, // new
    ];
    const result = detectInventoryChanges(previous, next);
    expect(result.soldKeys.sort()).toEqual(['VIN1', 'VIN3']); // VIN1 removed, VIN3 sold
    expect(result.addedKeys).toEqual(['VIN4']);
    expect(result.priceChanges).toHaveLength(1);
    expect(result.priceChanges[0]).toMatchObject({ key: 'VIN2', deltaCents: -200000 });
  });

  it('computes listings needing takedown', () => {
    const listings = [
      { vehicleKey: 'VIN1', status: 'ACTIVE' },
      { vehicleKey: 'VIN2', status: 'REMOVED' },
      { vehicleKey: 'VIN3', status: 'ACTIVE' },
    ];
    const takedown = listingsNeedingTakedown(listings, ['VIN1', 'VIN2']);
    expect(takedown).toEqual([{ vehicleKey: 'VIN1', status: 'ACTIVE' }]);
  });
});
