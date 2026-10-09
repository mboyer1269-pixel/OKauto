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

export const VIN_DECODE_FIELDS = [
  'year',
  'make',
  'model',
  'trim',
  'bodyStyle',
  'engine',
  'fuelType',
  'transmission',
  'drivetrain',
  'doors',
  'cylinders',
] as const;

export type VinDecodeField = (typeof VIN_DECODE_FIELDS)[number];

export const VIN_DECODE_FIELD_LABELS_FR: Record<VinDecodeField, string> = {
  year: 'année',
  make: 'marque',
  model: 'modèle',
  trim: 'version',
  bodyStyle: 'carrosserie',
  engine: 'moteur',
  fuelType: 'carburant',
  transmission: 'transmission',
  drivetrain: 'traction',
  doors: 'portes',
  cylinders: 'cylindres',
};

export type VinDecodeSource = Partial<
  Record<VinDecodeField, string | number | null>
> & {
  vin?: string | null;
  vinDecodedAt?: Date | string | null;
  vinDecodedVin?: string | null;
};

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

export function isEmptyVinDecodeField(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

export function vehicleNeedsVinDecode(vehicle: VinDecodeSource): boolean {
  const vin = vehicle.vin ? normalizeVin(vehicle.vin) : '';
  if (!isValidVinFormat(vin)) return false;
  if (
    vehicle.vinDecodedAt &&
    vehicle.vinDecodedVin &&
    normalizeVin(vehicle.vinDecodedVin) === vin
  ) {
    return false;
  }
  return VIN_DECODE_FIELDS.some((field) =>
    isEmptyVinDecodeField(vehicle[field]),
  );
}

/**
 * vPIC never overwrites dealer/user values. Only empty fields are filled.
 * Trim, options, and other site data always take precedence.
 */
export function emptyFieldsFromVinDecode<T extends VinDecodeSource>(
  current: T,
  decoded: VinDecodeResult,
): { patch: Partial<Record<VinDecodeField, string | number>>; filled: VinDecodeField[]; skipped: VinDecodeField[] } {
  const patch: Partial<Record<VinDecodeField, string | number>> = {};
  const filled: VinDecodeField[] = [];
  const skipped: VinDecodeField[] = [];

  for (const field of VIN_DECODE_FIELDS) {
    const decodedValue = decoded[field];
    if (decodedValue == null || decodedValue === '') continue;
    if (!isEmptyVinDecodeField(current[field])) {
      skipped.push(field);
      continue;
    }
    patch[field] = decodedValue;
    filled.push(field);
  }

  return { patch, filled, skipped };
}

export function fillEmptyStringFieldsFromVinDecode(
  current: Record<string, string>,
  decoded: VinDecodeResult,
): {
  next: Record<string, string>;
  filled: VinDecodeField[];
  skipped: VinDecodeField[];
} {
  const { patch, filled, skipped } = emptyFieldsFromVinDecode(
    current as VinDecodeSource,
    decoded,
  );
  const next = { ...current };
  const applied: VinDecodeField[] = [];
  for (const field of filled) {
    if (!(field in current)) continue;
    const value = patch[field];
    if (value == null) continue;
    next[field] = String(value);
    applied.push(field);
  }
  return { next, filled: applied, skipped };
}

export function vinDecodeErrorMessageFr(error?: string): string {
  if (!error) return 'Le NIV n’a pas pu être décodé.';
  if (/invalid vin format/i.test(error)) {
    return 'NIV invalide. Il doit contenir 17 caractères (lettres et chiffres, sans I, O ni Q).';
  }
  if (
    /NHTSA API error/i.test(error) ||
    /failed to fetch|network|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(error)
  ) {
    return 'Le service de décodage NHTSA (vPIC) est indisponible. Réessayez plus tard.';
  }
  return 'Le NIV n’a pas pu être décodé. Vérifiez le numéro ou réessayez plus tard.';
}

/** HTTP/network failures should be retried. Invalid or unknown VINs should not. */
export function isRetryableVinDecodeError(error?: string): boolean {
  if (!error) return false;
  return (
    /NHTSA API error/i.test(error) ||
    /VIN decode failed/i.test(error) ||
    /failed to fetch|network|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(error)
  );
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
