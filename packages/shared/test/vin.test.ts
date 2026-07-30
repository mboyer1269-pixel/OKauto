import { describe, expect, it } from 'vitest';
import {
  decodeModelYear,
  decodeRegion,
  decodeVin,
  hasValidCheckDigit,
  isValidVinFormat,
  normalizeVin,
} from '../src/vin.js';

describe('vin', () => {
  it('normalizes casing and whitespace', () => {
    expect(normalizeVin('  1hgcm82633a004352 ')).toBe('1HGCM82633A004352');
  });

  it('rejects invalid lengths and characters', () => {
    expect(isValidVinFormat('SHORT')).toBe(false);
    expect(isValidVinFormat('1HGCM82633A00435I')).toBe(false); // I not allowed
    expect(isValidVinFormat('1HGCM82633A004352')).toBe(true);
  });

  it('validates the North American check digit', () => {
    // Known-good Honda VIN with correct check digit (position 9 = 3).
    expect(hasValidCheckDigit('1HGCM82633A004352')).toBe(true);
    // Flip the check digit → invalid.
    expect(hasValidCheckDigit('1HGCM82613A004352')).toBe(false);
  });

  it('decodes region from first character', () => {
    expect(decodeRegion('1HGCM82633A004352')).toBe('North America');
    expect(decodeRegion('WBA000000000000000'.slice(0, 17))).toBe('Europe');
    expect(decodeRegion('JHM000000000000000'.slice(0, 17))).toBe('Asia');
  });

  it('decodes model year to a plausible value', () => {
    const year = decodeModelYear('1HGCM82633A004352', 2024);
    // Code '3' at position 10 → 2003 or 2033; not more than one year in future.
    expect(year).toBe(2003);
  });

  it('produces a structured decode with warnings', () => {
    const result = decodeVin('1HGCM82633A004352');
    expect(result.valid).toBe(true);
    expect(result.manufacturer).toBe('Honda');
    expect(result.region).toBe('North America');
    expect(result.warnings).toHaveLength(0);
  });

  it('flags invalid VINs', () => {
    const result = decodeVin('NOTAVIN');
    expect(result.valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
