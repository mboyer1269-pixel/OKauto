import { describe, it, expect } from 'vitest';
import {
  generateTemplateDescription,
  generateListingTitle,
  generateMarketplaceTitle,
} from '../description';
import { isValidVinFormat, normalizeVin } from '../vin';

describe('description', () => {
  it('generates listing title from vehicle data', () => {
    const title = generateListingTitle({
      year: 2022,
      make: 'Honda',
      model: 'Accord',
      trim: 'Sport',
    });
    expect(title).toBe('2022 Honda Accord Sport');
  });

  it('generates template description with key fields', () => {
    const desc = generateTemplateDescription({
      year: 2022,
      make: 'Honda',
      model: 'Accord',
      mileage: 25000,
      exteriorColor: 'Black',
      dealershipName: 'Demo Motors',
      phone: '555-1234',
    });
    expect(desc).toContain('2022 Honda Accord');
    expect(desc).toContain('25,000 miles');
    expect(desc).toContain('Demo Motors');
  });

  it('generates marketplace title with mileage', () => {
    const title = generateMarketplaceTitle({
      year: 2022,
      make: 'Honda',
      model: 'Accord',
      mileage: 25000,
    });
    expect(title).toContain('25,000 mi');
  });
});

describe('vin', () => {
  it('normalizes VIN to uppercase', () => {
    expect(normalizeVin('1hgbh41jxmn109186')).toBe('1HGBH41JXMN109186');
  });

  it('validates VIN format', () => {
    expect(isValidVinFormat('1HGBH41JXMN109186')).toBe(true);
    expect(isValidVinFormat('INVALID')).toBe(false);
    expect(isValidVinFormat('1HGBH41JXMN10918')).toBe(false);
  });
});
