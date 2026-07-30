/**
 * Clean-room VIN utilities implementing the public ISO 3779 / FMVSS 115 standard:
 * transliteration, check-digit validation, model-year decoding, and a WMI
 * (World Manufacturer Identifier) prefix table compiled from publicly documented
 * assignments. No third-party decoder source was consulted.
 */

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** Model-year codes, 30-year cycle starting 1980 (letters) then 2001-2009 (digits). */
const YEAR_CODES: Record<string, number> = {
  A: 1980, B: 1981, C: 1982, D: 1983, E: 1984, F: 1985, G: 1986, H: 1987,
  J: 1988, K: 1989, L: 1990, M: 1991, N: 1992, P: 1993, R: 1994, S: 1995,
  T: 1996, V: 1997, W: 1998, X: 1999, Y: 2000,
  "1": 2001, "2": 2002, "3": 2003, "4": 2004, "5": 2005, "6": 2006, "7": 2007, "8": 2008, "9": 2009,
};

const REGION_BY_FIRST_CHAR: Record<string, string> = {
  "1": "United States", "4": "United States", "5": "United States",
  "2": "Canada", "3": "Mexico",
  J: "Japan", K: "South Korea", L: "China",
  S: "United Kingdom", W: "Germany", V: "France/Spain",
  Y: "Sweden/Finland", Z: "Italy",
  "6": "Australia", "7": "New Zealand",
  "8": "Argentina", "9": "Brazil",
};

/** Common publicly documented WMI → make assignments (non-exhaustive). */
const WMI_MAKES: Record<string, string> = {
  "1G1": "Chevrolet", "1G6": "Cadillac", "1GC": "Chevrolet", "1GT": "GMC", "1GM": "Pontiac",
  "2G1": "Chevrolet", "3GC": "Chevrolet", "3GN": "Chevrolet",
  "1FA": "Ford", "1FB": "Ford", "1FT": "Ford", "1FM": "Ford", "3FA": "Ford", "1ZV": "Ford",
  "2FA": "Ford", "2FM": "Ford",
  JTD: "Toyota", JTE: "Toyota", JTM: "Toyota", "4T1": "Toyota", "4T3": "Toyota", "5TD": "Toyota",
  "5TF": "Toyota", "2T1": "Toyota", "2T3": "Toyota", JT3: "Toyota", JTN: "Toyota",
  "1HG": "Honda", "2HG": "Honda", "5J6": "Honda", "3HG": "Honda", "19X": "Honda", JHM: "Honda",
  "2HK": "Honda", "5FN": "Honda",
  KMH: "Hyundai", "5NP": "Hyundai", KM8: "Hyundai", KND: "Kia", KNA: "Kia", "5XY": "Kia",
  "3VW": "Volkswagen", WVW: "Volkswagen", "1VW": "Volkswagen", WV2: "Volkswagen",
  WBA: "BMW", WBS: "BMW", "5UX": "BMW", WBY: "BMW",
  WDD: "Mercedes-Benz", WDB: "Mercedes-Benz", "4JG": "Mercedes-Benz", WDC: "Mercedes-Benz",
  "1C3": "Chrysler", "1C4": "Jeep", "1C6": "Ram", "2C4": "Chrysler", "3C6": "Ram", "1C8": "Jeep",
  "1D4": "Dodge", "1B3": "Dodge",
  "1N4": "Nissan", "1N6": "Nissan", "3N1": "Nissan", "5N1": "Nissan", JN1: "Nissan", JN8: "Nissan",
  "5YJ": "Tesla", "7SA": "Tesla", LRW: "Tesla",
  JF1: "Subaru", JF2: "Subaru", "4S3": "Subaru", "4S4": "Subaru",
  JM1: "Mazda", JM3: "Mazda", "1YV": "Mazda",
  KL4: "Buick", KNM: "Renault Samsung",
  SAJ: "Jaguar", SAL: "Land Rover", "2H4": "Honda",
  YV1: "Volvo", YV4: "Volvo", "1LN": "Lincoln", "5LM": "Lincoln",
  WAU: "Audi", WA1: "Audi", TRU: "Audi",
};

export interface VinDecodeResult {
  vin: string;
  valid: boolean;
  checkDigitValid: boolean;
  modelYear?: number;
  region?: string;
  wmiMake?: string;
  errors: string[];
}

export function normalizeVin(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidVinFormat(vin: string): boolean {
  return VIN_REGEX.test(vin);
}

export function computeCheckDigit(vin: string): string | null {
  if (!isValidVinFormat(vin)) return null;
  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const ch = vin[i]!;
    const value = TRANSLITERATION[ch] ?? Number.parseInt(ch, 10);
    if (Number.isNaN(value)) return null;
    sum += value * WEIGHTS[i]!;
  }
  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
}

export function isCheckDigitValid(vin: string): boolean {
  const expected = computeCheckDigit(vin);
  if (expected === null) return false;
  return vin[8] === expected;
}

/**
 * Decodes model year from position 10. Disambiguation heuristic (per public standard):
 * position 7 alphabetic → 1980-2009 cycle, numeric → 2010-2039 cycle (+30).
 */
export function decodeModelYear(vin: string): number | undefined {
  if (!isValidVinFormat(vin)) return undefined;
  const code = vin[9]!;
  const base = YEAR_CODES[code];
  if (base === undefined) return undefined;
  const seventh = vin[6]!;
  const seventhIsAlpha = /[A-Z]/.test(seventh);
  const year = seventhIsAlpha ? base : base + 30;
  const maxPlausible = new Date().getFullYear() + 2;
  return year > maxPlausible ? base : year;
}

export function decodeRegion(vin: string): string | undefined {
  if (vin.length < 1) return undefined;
  return REGION_BY_FIRST_CHAR[vin[0]!];
}

export function decodeWmiMake(vin: string): string | undefined {
  if (vin.length < 3) return undefined;
  return WMI_MAKES[vin.slice(0, 3)];
}

export function decodeVin(input: string): VinDecodeResult {
  const vin = normalizeVin(input);
  const errors: string[] = [];
  if (vin.length !== 17) errors.push(`VIN must be 17 characters (got ${vin.length})`);
  if (/[IOQ]/.test(vin)) errors.push("VIN must not contain I, O, or Q");
  if (!isValidVinFormat(vin)) {
    return { vin, valid: false, checkDigitValid: false, errors };
  }
  const checkDigitValid = isCheckDigitValid(vin);
  if (!checkDigitValid) errors.push("Check digit mismatch");
  return {
    vin,
    valid: errors.length === 0,
    checkDigitValid,
    modelYear: decodeModelYear(vin),
    region: decodeRegion(vin),
    wmiMake: decodeWmiMake(vin),
    errors,
  };
}
