import { describe, expect, it } from 'vitest';
import {
  buildVehicleTitle,
  coerceCategory,
  coerceFuelType,
  coerceTransmission,
  formatMileage,
  formatPrice,
  normalizeVehicle,
  parseFeatures,
  parseMileage,
  parsePriceToCents,
  parseYear,
} from '../src/normalize.js';

describe('normalize', () => {
  it('parses prices to integer cents', () => {
    expect(parsePriceToCents('$24,995')).toBe(2499500);
    expect(parsePriceToCents('19995.50')).toBe(1999550);
    expect(parsePriceToCents(15000)).toBe(1500000);
    expect(parsePriceToCents('')).toBeNull();
  });

  it('parses mileage', () => {
    expect(parseMileage('45,120 miles')).toBe(45120);
    expect(parseMileage(30000)).toBe(30000);
    expect(parseMileage('n/a')).toBeNull();
  });

  it('validates year ranges', () => {
    expect(parseYear('2019')).toBe(2019);
    expect(parseYear(1850)).toBeNull();
    expect(parseYear('3000', 2024)).toBeNull();
  });

  it('coerces enums via aliases', () => {
    expect(coerceCategory('truck')).toBe('AUTOMOTIVE');
    expect(coerceCategory('Boat')).toBe('MARINE_POWERSPORTS');
    expect(coerceCategory('unknown thing')).toBe('OTHER');
    expect(coerceFuelType('EV')).toBe('ELECTRIC');
    expect(coerceTransmission('stick')).toBe('MANUAL');
  });

  it('deduplicates and trims features', () => {
    expect(parseFeatures('Bluetooth, Sunroof; Bluetooth | Backup Camera')).toEqual([
      'Bluetooth',
      'Sunroof',
      'Backup Camera',
    ]);
    expect(parseFeatures(['A', 'a', 'B'])).toEqual(['A', 'B']);
  });

  it('builds a clean vehicle title', () => {
    expect(
      buildVehicleTitle({ year: 2020, make: 'Ford', model: 'F-150', trim: 'XLT' }),
    ).toBe('2020 Ford F-150 XLT');
  });

  it('normalizes a raw row end to end', () => {
    const v = normalizeVehicle({
      vin: ' 1hgcm82633a004352 ',
      stockNumber: 'A123',
      category: 'car',
      year: '2003',
      make: 'honda',
      model: 'Accord',
      trim: 'EX',
      mileage: '120,000 mi',
      price: '$8,995',
      fuelType: 'gas',
      transmission: 'automatic',
      features: 'Leather; Sunroof',
    });
    expect(v.vin).toBe('1HGCM82633A004352');
    expect(v.make).toBe('Honda');
    expect(v.priceCents).toBe(899500);
    expect(v.fuelType).toBe('GASOLINE');
    expect(v.transmission).toBe('AUTOMATIC');
    expect(v.title).toBe('2003 Honda Accord EX');
    expect(v.features).toEqual(['Leather', 'Sunroof']);
  });

  it('formats price and mileage', () => {
    expect(formatPrice(2499500)).toBe('$24,995');
    expect(formatMileage(45120)).toBe('45,120 mi');
    expect(formatPrice(null)).toBe('');
  });
});
