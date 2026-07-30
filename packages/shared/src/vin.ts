/**
 * VIN utilities: validation, structural decoding, and check-digit verification.
 *
 * This is an independent implementation of the public ISO 3779 / US 49 CFR Part 565
 * VIN standard. No third-party data tables are copied; the World Manufacturer
 * Identifier (WMI) map below is a small, illustrative set commonly published by NHTSA
 * and can be extended or replaced by the online NHTSA vPIC decoder at runtime.
 */

const VIN_LENGTH = 17;
// I, O, Q are not allowed in VINs.
const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
};

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

// Model-year codes (position 10). Cycles every 30 years; we resolve to the most
// plausible year given the current date.
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

/** Small illustrative WMI → manufacturer map (extend as needed). */
const WMI_MAP: Record<string, string> = {
  '1G1': 'Chevrolet',
  '1GC': 'Chevrolet',
  '1FA': 'Ford',
  '1FT': 'Ford',
  '1FM': 'Ford',
  '1HG': 'Honda',
  '2HG': 'Honda',
  JHM: 'Honda',
  '1N4': 'Nissan',
  JN1: 'Nissan',
  '4T1': 'Toyota',
  '5TD': 'Toyota',
  JTD: 'Toyota',
  '1C4': 'Jeep',
  '3C4': 'Jeep',
  WBA: 'BMW',
  WDB: 'Mercedes-Benz',
  WVW: 'Volkswagen',
  '5YJ': 'Tesla',
  KMH: 'Hyundai',
  KND: 'Kia',
};

const REGION_BY_FIRST_CHAR: Array<{ test: RegExp; region: string }> = [
  { test: /[A-H]/, region: 'Africa' },
  { test: /[J-R]/, region: 'Asia' },
  { test: /[S-Z]/, region: 'Europe' },
  { test: /[1-5]/, region: 'North America' },
  { test: /[6-7]/, region: 'Oceania' },
  { test: /[8-9]/, region: 'South America' },
];

export function normalizeVin(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidVinFormat(raw: string): boolean {
  return VIN_REGEX.test(normalizeVin(raw));
}

/**
 * Verifies the North American check digit (position 9). VINs from some regions
 * (e.g. parts of Europe/Asia) do not always enforce this, so callers should treat
 * a failed check as a warning, not a hard rejection.
 */
export function hasValidCheckDigit(raw: string): boolean {
  const vin = normalizeVin(raw);
  if (!VIN_REGEX.test(vin)) return false;
  let sum = 0;
  for (let i = 0; i < VIN_LENGTH; i += 1) {
    const char = vin[i]!;
    const value = TRANSLITERATION[char];
    if (value === undefined) return false;
    sum += value * WEIGHTS[i]!;
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  return vin[8] === expected;
}

export function decodeRegion(raw: string): string | null {
  const vin = normalizeVin(raw);
  const first = vin[0];
  if (!first) return null;
  for (const { test, region } of REGION_BY_FIRST_CHAR) {
    if (test.test(first)) return region;
  }
  return null;
}

export function decodeModelYear(raw: string, referenceYear = new Date().getUTCFullYear()): number | null {
  const vin = normalizeVin(raw);
  const code = vin[9];
  if (!code) return null;
  const index = YEAR_CODES.indexOf(code);
  if (index < 0) return null;
  // Base cycle started in 1980 (code 'A'). Resolve to the most recent plausible year
  // not more than one year in the future.
  const base = 1980 + index;
  let year = base;
  while (year + 30 <= referenceYear + 1) {
    year += 30;
  }
  return year;
}

export function decodeManufacturer(raw: string): string | null {
  const vin = normalizeVin(raw);
  const wmi = vin.slice(0, 3);
  if (WMI_MAP[wmi]) return WMI_MAP[wmi];
  const twoChar = vin.slice(0, 2);
  const match = Object.entries(WMI_MAP).find(([key]) => key.startsWith(twoChar));
  return match ? match[1] : null;
}

export interface VinDecodeResult {
  vin: string;
  valid: boolean;
  checkDigitValid: boolean;
  region: string | null;
  modelYear: number | null;
  manufacturer: string | null;
  warnings: string[];
}

/** Offline structural decode. For richer data, use the NHTSA vPIC client at runtime. */
export function decodeVin(raw: string, referenceYear?: number): VinDecodeResult {
  const vin = normalizeVin(raw);
  const warnings: string[] = [];
  const valid = isValidVinFormat(vin);
  if (!valid) warnings.push('VIN is not 17 valid characters.');
  const checkDigitValid = valid && hasValidCheckDigit(vin);
  if (valid && !checkDigitValid) {
    warnings.push('Check digit does not match (non-NA VINs may not enforce this).');
  }
  return {
    vin,
    valid,
    checkDigitValid,
    region: valid ? decodeRegion(vin) : null,
    modelYear: valid ? decodeModelYear(vin, referenceYear) : null,
    manufacturer: valid ? decodeManufacturer(vin) : null,
    warnings,
  };
}
