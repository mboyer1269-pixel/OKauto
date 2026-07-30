import { describe, expect, it } from 'vitest';
import {
  FACEBOOK_MARKETPLACE_ADAPTER,
  getAdapterForUrl,
  matchUrlPattern,
} from '../src/marketplace/adapters.js';
import { mapVehicleToMarketplace } from '../src/marketplace/mapping.js';
import { normalizeVehicle } from '../src/normalize.js';
import { parseCsv } from '../src/csv.js';

describe('marketplace adapters', () => {
  it('matches chrome-style url patterns', () => {
    expect(
      matchUrlPattern(
        '*://*.facebook.com/marketplace/create/vehicle*',
        'https://www.facebook.com/marketplace/create/vehicle',
      ),
    ).toBe(true);
    expect(matchUrlPattern('*://*.facebook.com/marketplace/create/vehicle*', 'https://example.com')).toBe(
      false,
    );
  });

  it('resolves the default adapter for a marketplace url', () => {
    const adapter = getAdapterForUrl('https://web.facebook.com/marketplace/create/vehicle');
    expect(adapter).toBe(FACEBOOK_MARKETPLACE_ADAPTER);
  });

  it('every field has at least one strategy', () => {
    for (const field of FACEBOOK_MARKETPLACE_ADAPTER.fields) {
      expect(field.strategies.length).toBeGreaterThan(0);
    }
  });
});

describe('marketplace mapping', () => {
  it('maps a normalized vehicle to composer fields', () => {
    const v = normalizeVehicle({
      category: 'car',
      year: 2020,
      make: 'Ford',
      model: 'F-150',
      mileage: 45000,
      price: 32995,
      transmission: 'automatic',
      fuelType: 'gas',
    });
    const fields = mapVehicleToMarketplace(v, 'A great truck.', ['https://img/1.jpg']);
    expect(fields.vehicleType).toBe('Car/Truck');
    expect(fields.year).toBe('2020');
    expect(fields.price).toBe('32995');
    expect(fields.transmission).toBe('Automatic transmission');
    expect(fields.fuelType).toBe('Gasoline');
    expect(fields.photoUrls).toEqual(['https://img/1.jpg']);
  });
});

describe('csv', () => {
  it('parses quoted fields with commas and escaped quotes', () => {
    const rows = parseCsv('vin,make,note\n"1HG...","Honda","Says ""hi"", ok"\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ vin: '1HG...', make: 'Honda', note: 'Says "hi", ok' });
  });

  it('handles CRLF and blank lines', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n\r\n3,4\r\n');
    expect(rows).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });
});
