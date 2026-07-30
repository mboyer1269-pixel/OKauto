export interface VinDecodeResult {
  vin: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  bodyStyle?: string;
  engine?: string;
  fuelType?: string;
  transmission?: string;
  drivetrain?: string;
  doors?: number;
  cylinders?: number;
  manufacturer?: string;
  plantCountry?: string;
  error?: string;
}

interface NhtsaResult {
  Value: string | null;
  ValueId: string | null;
  Variable: string;
  VariableId: number;
}

interface NhtsaResponse {
  Count: number;
  Message: string;
  SearchCriteria: string;
  Results: NhtsaResult[];
}

function getValue(results: NhtsaResult[], variable: string): string | undefined {
  const item = results.find((r) => r.Variable === variable);
  const val = item?.Value;
  return val && val !== 'Not Applicable' && val !== '' ? val : undefined;
}

export function normalizeVin(vin: string): string {
  return vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
}

export function isValidVinFormat(vin: string): boolean {
  const normalized = normalizeVin(vin);
  if (normalized.length !== 17) return false;
  // VIN cannot contain I, O, Q
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(normalized);
}

export async function decodeVin(vin: string): Promise<VinDecodeResult> {
  const normalized = normalizeVin(vin);

  if (!isValidVinFormat(normalized)) {
    return { vin: normalized, error: 'Invalid VIN format. Must be 17 characters.' };
  }

  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${normalized}?format=json`;
    const response = await fetch(url);

    if (!response.ok) {
      return { vin: normalized, error: `NHTSA API error: ${response.status}` };
    }

    const data = (await response.json()) as NhtsaResponse;
    const results = data.Results ?? [];

    const errorCode = getValue(results, 'Error Code');
    if (errorCode && errorCode !== '0') {
      const errorText = getValue(results, 'Error Text');
      return { vin: normalized, error: errorText ?? 'VIN decode failed' };
    }

    const yearStr = getValue(results, 'Model Year');
    const doorsStr = getValue(results, 'Doors');
    const cylStr = getValue(results, 'Engine Number of Cylinders');

    return {
      vin: normalized,
      year: yearStr ? parseInt(yearStr, 10) : undefined,
      make: getValue(results, 'Make'),
      model: getValue(results, 'Model'),
      trim: getValue(results, 'Trim'),
      bodyStyle: getValue(results, 'Body Class'),
      engine: getValue(results, 'Displacement (L)')
        ? `${getValue(results, 'Displacement (L)')}L ${getValue(results, 'Engine Configuration') ?? ''}`.trim()
        : undefined,
      fuelType: getValue(results, 'Fuel Type - Primary'),
      transmission: getValue(results, 'Transmission Style'),
      drivetrain: getValue(results, 'Drive Type'),
      doors: doorsStr ? parseInt(doorsStr, 10) : undefined,
      cylinders: cylStr ? parseInt(cylStr, 10) : undefined,
      manufacturer: getValue(results, 'Manufacturer Name'),
      plantCountry: getValue(results, 'Plant Country'),
    };
  } catch (err) {
    return {
      vin: normalized,
      error: err instanceof Error ? err.message : 'VIN decode failed',
    };
  }
}
