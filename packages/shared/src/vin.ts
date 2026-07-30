/**
 * VIN (Vehicle Identification Number) utilities.
 *
 * Implements ISO 3779 / NHTSA check-digit validation and a small offline
 * decoder (model year + WMI manufacturer hints). The API augments this with
 * the public NHTSA vPIC decoder when network access is available.
 */

const VIN_LENGTH = 17;
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

/** Transliteration table for check digit computation (I, O, Q are invalid). */
const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
};

const POSITION_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** Model-year code table (position 10). Cycles every 30 years. */
const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

const WMI_MANUFACTURERS: Record<string, string> = {
  "1C3": "Chrysler", "1C4": "Chrysler", "1C6": "Ram",
  "1FA": "Ford", "1FT": "Ford", "1FM": "Ford", "1FD": "Ford",
  "1G1": "Chevrolet", "1GC": "Chevrolet", "1GN": "Chevrolet", "1G6": "Cadillac", "1GY": "Cadillac",
  "1GM": "Pontiac", "1G4": "Buick", "1GT": "GMC", "1GK": "GMC",
  "1HG": "Honda", "1HD": "Harley-Davidson", "1J4": "Jeep", "1J8": "Jeep",
  "1N4": "Nissan", "1N6": "Nissan", "1VW": "Volkswagen", "1YV": "Mazda",
  "2C3": "Chrysler", "2C4": "Chrysler", "2FM": "Ford", "2G1": "Chevrolet",
  "2HG": "Honda", "2HK": "Honda", "2T1": "Toyota", "2T2": "Lexus",
  "3FA": "Ford", "3GN": "Chevrolet", "3N1": "Nissan", "3VW": "Volkswagen",
  "4F2": "Mazda", "4JG": "Mercedes-Benz", "4S3": "Subaru", "4S4": "Subaru", "4T1": "Toyota", "4T3": "Toyota",
  "5FN": "Honda", "5J6": "Honda", "5LM": "Lincoln", "5N1": "Nissan", "5NP": "Hyundai",
  "5TD": "Toyota", "5TF": "Toyota", "5UX": "BMW", "5YJ": "Tesla", "7SA": "Tesla",
  "JA3": "Mitsubishi", "JA4": "Mitsubishi", "JF1": "Subaru", "JF2": "Subaru",
  "JHM": "Honda", "JH4": "Acura", "JM1": "Mazda", "JM3": "Mazda",
  "JN1": "Nissan", "JN8": "Nissan", "JT2": "Toyota", "JTD": "Toyota", "JTE": "Toyota", "JTH": "Lexus", "JTJ": "Lexus",
  "KL4": "Buick", "KM8": "Hyundai", "KMH": "Hyundai", "KNA": "Kia", "KND": "Kia", "KNM": "Renault Samsung",
  "SAJ": "Jaguar", "SAL": "Land Rover", "SCA": "Rolls-Royce", "SCC": "Lotus",
  "TRU": "Audi", "VF1": "Renault", "W04": "Buick", "WA1": "Audi", "WAU": "Audi",
  "WBA": "BMW", "WBS": "BMW", "WBX": "BMW", "WDB": "Mercedes-Benz", "WDC": "Mercedes-Benz", "WDD": "Mercedes-Benz",
  "WP0": "Porsche", "WP1": "Porsche", "WVG": "Volkswagen", "WVW": "Volkswagen",
  "YV1": "Volvo", "YV4": "Volvo", "ZFF": "Ferrari", "ZAM": "Maserati", "ZAR": "Alfa Romeo",
};

export interface VinInfo {
  vin: string;
  valid: boolean;
  /** Reason validation failed, when `valid` is false. */
  error?: string;
  wmi?: string;
  manufacturer?: string;
  /** Candidate model years (the 30-year cycle makes position 10 ambiguous). */
  modelYearCandidates?: number[];
  /** Best-guess model year (most recent candidate not in the future). */
  modelYear?: number;
  serial?: string;
}

export function normalizeVin(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function isValidVinFormat(vin: string): boolean {
  return VIN_PATTERN.test(vin);
}

/** Compute the ISO 3779 check digit for a 17-character VIN. */
export function computeVinCheckDigit(vin: string): string | null {
  if (vin.length !== VIN_LENGTH) return null;
  let sum = 0;
  for (let i = 0; i < VIN_LENGTH; i++) {
    const ch = vin[i]!;
    const value = TRANSLITERATION[ch];
    if (value === undefined) return null;
    sum += value * POSITION_WEIGHTS[i]!;
  }
  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
}

export function validateVin(raw: string): VinInfo {
  const vin = normalizeVin(raw);
  if (vin.length !== VIN_LENGTH) {
    return { vin, valid: false, error: `VIN must be 17 characters (got ${vin.length})` };
  }
  if (!isValidVinFormat(vin)) {
    return { vin, valid: false, error: "VIN contains invalid characters (I, O and Q are not allowed)" };
  }
  const expected = computeVinCheckDigit(vin);
  if (expected !== null && vin[8] !== expected) {
    return { vin, valid: false, error: `VIN check digit mismatch (expected ${expected})` };
  }
  return { vin, valid: true, ...decodeVinOffline(vin) };
}

/** Offline best-effort decode: WMI manufacturer + model year candidates. */
export function decodeVinOffline(rawVin: string): Omit<VinInfo, "vin" | "valid" | "error"> {
  const vin = normalizeVin(rawVin);
  if (vin.length !== VIN_LENGTH) return {};
  const wmi = vin.slice(0, 3);
  const manufacturer = WMI_MANUFACTURERS[wmi];
  const yearChar = vin[9]!;
  const idx = YEAR_CODES.indexOf(yearChar);
  let modelYearCandidates: number[] | undefined;
  let modelYear: number | undefined;
  if (idx >= 0) {
    // Cycle bases: 1980, 2010, 2040...
    modelYearCandidates = [1980 + idx, 2010 + idx, 2040 + idx];
    const currentYear = new Date().getFullYear();
    modelYear = modelYearCandidates
      .filter((y) => y <= currentYear + 1)
      .sort((a, b) => b - a)[0];
  }
  return { wmi, manufacturer, modelYearCandidates, modelYear, serial: vin.slice(11) };
}
