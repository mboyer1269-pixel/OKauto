/** Minimal offline VIN decode (NHTSA-style year + WMI heuristics). No proprietary data. */

const YEAR_CODES: Record<string, number> = {
  A: 2010,
  B: 2011,
  C: 2012,
  D: 2013,
  E: 2014,
  F: 2015,
  G: 2016,
  H: 2017,
  J: 2018,
  K: 2019,
  L: 2020,
  M: 2021,
  N: 2022,
  P: 2023,
  R: 2024,
  S: 2025,
  T: 2026,
  V: 2027,
  W: 2028,
  X: 2029,
  Y: 2030,
  '1': 2001,
  '2': 2002,
  '3': 2003,
  '4': 2004,
  '5': 2005,
  '6': 2006,
  '7': 2007,
  '8': 2008,
  '9': 2009,
};

const WMI_MAKE: Record<string, string> = {
  '1HG': 'Honda',
  '2HG': 'Honda',
  '19X': 'Honda',
  '1FT': 'Ford',
  '1FA': 'Ford',
  '1G1': 'Chevrolet',
  '1GC': 'Chevrolet',
  '1N4': 'Nissan',
  JN1: 'Nissan',
  '4T1': 'Toyota',
  '5TD': 'Toyota',
  JTD: 'Toyota',
  '5YJ': 'Tesla',
  WBA: 'BMW',
  WVW: 'Volkswagen',
  WAU: 'Audi',
  JM1: 'Mazda',
  KMH: 'Hyundai',
  '5NP': 'Hyundai',
  '3VW': 'Volkswagen',
};

export function isValidVinFormat(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin);
}

export function decodeVinLocal(vinRaw: string): {
  vin: string;
  year?: number;
  make?: string;
  wmi: string;
  validFormat: boolean;
} {
  const vin = vinRaw.trim().toUpperCase();
  const validFormat = isValidVinFormat(vin);
  if (!validFormat) {
    return { vin, wmi: vin.slice(0, 3), validFormat };
  }
  const year = YEAR_CODES[vin[9]];
  const wmi3 = vin.slice(0, 3);
  const make = WMI_MAKE[wmi3];
  return { vin, year, make, wmi: wmi3, validFormat };
}

export async function decodeVinRemote(vin: string): Promise<Record<string, string | number | null> | null> {
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { Results?: Array<Record<string, string>> };
    const row = data.Results?.[0];
    if (!row) return null;
    return {
      vin,
      year: row.ModelYear ? Number(row.ModelYear) : null,
      make: row.Make || null,
      model: row.Model || null,
      trim: row.Trim || null,
      bodyStyle: row.BodyClass || null,
      plantCountry: row.PlantCountry || null,
    };
  } catch {
    return null;
  }
}
