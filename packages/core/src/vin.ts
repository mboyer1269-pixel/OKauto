/**
 * VIN validation and decoding.
 *
 * Validation implements the ISO 3779 / NHTSA check-digit algorithm.
 * Decoding prefers the free public NHTSA vPIC API and falls back to an
 * offline WMI + model-year-character decoder so the product keeps working
 * without network access.
 */

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

const TRANSLITERATION: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
};

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeVin(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidVin(raw: string): boolean {
  const vin = normalizeVin(raw);
  if (!VIN_REGEX.test(vin)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const value = TRANSLITERATION[vin[i]!];
    if (value === undefined) return false;
    sum += value * WEIGHTS[i]!;
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? "X" : String(remainder);
  return vin[8] === expected;
}

/** Model-year character table (position 10). Cycles every 30 years. */
const YEAR_CHARS = "ABCDEFGHJKLMNPRSTVWXY123456789";

export function decodeModelYear(
  vin: string,
  referenceYear = new Date().getFullYear(),
): number | null {
  const ch = normalizeVin(vin)[9];
  if (!ch) return null;
  const idx = YEAR_CHARS.indexOf(ch);
  if (idx === -1) return null;
  // Candidate years: 1980 + idx + 30k. Pick the latest not exceeding referenceYear + 1.
  let year = 1980 + idx;
  while (year + 30 <= referenceYear + 1) year += 30;
  return year;
}

/** Minimal offline WMI (first 3 chars) → manufacturer map for common makes. */
const WMI_MAKES: Record<string, string> = {
  "1C3": "Chrysler",
  "1C4": "Jeep",
  "1C6": "Ram",
  "1FA": "Ford",
  "1FM": "Ford",
  "1FT": "Ford",
  "1FD": "Ford",
  "1G1": "Chevrolet",
  "1GC": "Chevrolet",
  "1GN": "Chevrolet",
  "1GT": "GMC",
  "1GK": "GMC",
  "1G4": "Buick",
  "1G6": "Cadillac",
  "1GY": "Cadillac",
  "1HG": "Honda",
  "1HD": "Harley-Davidson",
  "1N4": "Nissan",
  "1N6": "Nissan",
  "1VW": "Volkswagen",
  "2C3": "Chrysler",
  "2C4": "Chrysler",
  "2FM": "Ford",
  "2G1": "Chevrolet",
  "2GN": "Chevrolet",
  "2HG": "Honda",
  "2HK": "Honda",
  "2HJ": "Honda",
  "2T1": "Toyota",
  "2T3": "Toyota",
  "3FA": "Ford",
  "3GN": "Chevrolet",
  "3GC": "Chevrolet",
  "3N1": "Nissan",
  "3VW": "Volkswagen",
  "4S3": "Subaru",
  "4S4": "Subaru",
  "4T1": "Toyota",
  "4T3": "Toyota",
  "5FN": "Honda",
  "5J6": "Honda",
  "5N1": "Nissan",
  "5NP": "Hyundai",
  "5TD": "Toyota",
  "5TF": "Toyota",
  "5YJ": "Tesla",
  "7SA": "Tesla",
  "5XY": "Kia",
  "5XX": "Kia",
  "3KP": "Kia",
  KNA: "Kia",
  KND: "Kia",
  KNM: "Renault Samsung",
  KM8: "Hyundai",
  KMH: "Hyundai",
  JHM: "Honda",
  JH4: "Acura",
  JTD: "Toyota",
  JT2: "Toyota",
  JTE: "Toyota",
  JTH: "Lexus",
  JTJ: "Lexus",
  JN1: "Nissan",
  JN8: "Nissan",
  JM1: "Mazda",
  JM3: "Mazda",
  JF1: "Subaru",
  JF2: "Subaru",
  SAJ: "Jaguar",
  SAL: "Land Rover",
  SCC: "Lotus",
  WAU: "Audi",
  WA1: "Audi",
  WBA: "BMW",
  WBS: "BMW",
  WBY: "BMW",
  "4US": "BMW",
  "5UX": "BMW",
  WDB: "Mercedes-Benz",
  WDC: "Mercedes-Benz",
  WDD: "Mercedes-Benz",
  W1K: "Mercedes-Benz",
  "4JG": "Mercedes-Benz",
  WVW: "Volkswagen",
  WV1: "Volkswagen",
  WP0: "Porsche",
  WP1: "Porsche",
  YV1: "Volvo",
  YV4: "Volvo",
  ZFF: "Ferrari",
  ZAM: "Maserati",
  ZAR: "Alfa Romeo",
};

export interface VinDecodeResult {
  vin: string;
  valid: boolean;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  bodyStyle: string | null;
  fuelType: string | null;
  transmission: string | null;
  drivetrain: string | null;
  engine: string | null;
  source: "vpic" | "offline";
}

export function decodeVinOffline(raw: string): VinDecodeResult {
  const vin = normalizeVin(raw);
  const wmi = vin.slice(0, 3);
  return {
    vin,
    valid: isValidVin(vin),
    year: decodeModelYear(vin),
    make: WMI_MAKES[wmi] ?? null,
    model: null,
    trim: null,
    bodyStyle: null,
    fuelType: null,
    transmission: null,
    drivetrain: null,
    engine: null,
    source: "offline",
  };
}

interface VpicResult {
  Results?: Array<Record<string, string>>;
}

/**
 * Decode via the public NHTSA vPIC API (a free, documented government API —
 * not a hidden/private endpoint). Falls back to offline decode on any failure.
 */
export async function decodeVin(
  raw: string,
  opts: { online?: boolean; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<VinDecodeResult> {
  const vin = normalizeVin(raw);
  const offline = decodeVinOffline(vin);
  const online = opts.online ?? true;
  if (!online || !offline.valid) return offline;

  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
    const res = await fetchImpl(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return offline;
    const data = (await res.json()) as VpicResult;
    const row = data.Results?.[0];
    if (!row) return offline;
    const pick = (key: string): string | null => {
      const v = row[key];
      return v && v.trim() !== "" && v !== "Not Applicable" ? v.trim() : null;
    };
    const yearStr = pick("ModelYear");
    const engineParts = [
      pick("DisplacementL") ? `${pick("DisplacementL")}L` : null,
      pick("EngineConfiguration"),
      pick("EngineCylinders") ? `${pick("EngineCylinders")}-cyl` : null,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      vin,
      valid: true,
      year: yearStr ? Number.parseInt(yearStr, 10) : offline.year,
      make: titleCaseMake(pick("Make")) ?? offline.make,
      model: pick("Model"),
      trim: pick("Trim"),
      bodyStyle: pick("BodyClass"),
      fuelType: pick("FuelTypePrimary"),
      transmission: pick("TransmissionStyle"),
      drivetrain: pick("DriveType"),
      engine: engineParts || null,
      source: "vpic",
    };
  } catch {
    return offline;
  }
}

function titleCaseMake(make: string | null): string | null {
  if (!make) return null;
  const KEEP_UPPER = new Set(["BMW", "GMC", "RAM", "MINI", "FIAT", "KIA"]);
  if (KEEP_UPPER.has(make.toUpperCase())) {
    return make.toUpperCase() === "KIA"
      ? "Kia"
      : make.toUpperCase() === "FIAT"
        ? "Fiat"
        : make.toUpperCase() === "RAM"
          ? "Ram"
          : make.toUpperCase();
  }
  return make
    .toLowerCase()
    .split(/[\s-]/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ")
    .replace("Mercedes Benz", "Mercedes-Benz");
}
