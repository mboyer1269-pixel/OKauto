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
  retryable?: boolean;
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

/** Matches `createVehicleSchema` string maxes so vPIC values never fail Zod. */
export const VIN_DECODE_STRING_LIMITS = {
  make: 100,
  model: 100,
  trim: 100,
  bodyStyle: 50,
  fuelType: 50,
  transmission: 50,
  drivetrain: 50,
  engine: 100,
} as const;

export const VIN_DECODE_FETCH_TIMEOUT_MS = 10_000;

/** Real vPIC Body Class for Terrain / Equinox / Yukon — 54 chars, over the 50 max. */
export const VPIC_SUV_BODY_CLASS =
  'Sport Utility Vehicle [SUV]/Multipurpose Vehicle [MPV]';

const MAKE_ACRONYMS = new Set(['GMC', 'BMW', 'RAM', 'MINI', 'KIA', 'FIAT']);

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

/** Apply a decode onto the latest form state. Ignore stale responses if the NIV changed. */
export function mergeVinDecodeIntoForm<T extends Record<string, string> & { vin: string }>(
  prev: T,
  decoded: VinDecodeResult,
): {
  next: T;
  filled: VinDecodeField[];
  skipped: VinDecodeField[];
  ignored: boolean;
} {
  if (normalizeVin(prev.vin) !== normalizeVin(decoded.vin)) {
    return { next: prev, filled: [], skipped: [], ignored: true };
  }
  const { next, filled, skipped } = fillEmptyStringFieldsFromVinDecode(
    prev,
    decoded,
  );
  return { next: next as T, filled, skipped, ignored: false };
}

export function vinDecodeStampFromCreate(input: {
  vin?: string | null;
  vinDecoded?: boolean | null;
}): {
  vinDecodedAt?: Date;
  vinDecodedVin?: string;
  vinDecodeAttempts?: number;
  vinDecodeError?: null;
} {
  const vin = input.vin ? normalizeVin(input.vin) : '';
  if (!input.vinDecoded || !isValidVinFormat(vin)) return {};
  return {
    vinDecodedAt: new Date(),
    vinDecodedVin: vin,
    vinDecodeAttempts: 0,
    vinDecodeError: null,
  };
}

export function vinDecodeErrorMessageFr(error?: string): string {
  if (!error) return 'Le NIV n’a pas pu être décodé.';
  if (/invalid vin format/i.test(error)) {
    return 'NIV invalide. Il doit contenir 17 caractères (lettres et chiffres, sans I, O ni Q).';
  }
  if (isRetryableVinDecodeError(error)) {
    return 'Le service de décodage NHTSA (vPIC) est indisponible. Réessayez plus tard.';
  }
  return 'Le NIV n’a pas pu être décodé. Vérifiez le numéro ou réessayez plus tard.';
}

function networkErrorCode(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const withCause = err as { cause?: unknown; code?: unknown };
  if (typeof withCause.code === 'string') return withCause.code;
  if (withCause.cause && typeof withCause.cause === 'object') {
    const nested = withCause.cause as { code?: unknown };
    if (typeof nested.code === 'string') return nested.code;
  }
  return '';
}

const RETRYABLE_CODE =
  /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|EHOSTUNREACH|UND_ERR|ABORT/i;

/** HTTP/network failures should be retried. Invalid or unknown VINs should not. */
export function isRetryableVinDecodeError(error?: string): boolean {
  if (!error) return false;
  if (/invalid vin format/i.test(error)) return false;
  if (/NHTSA API error:\s*(429|5\d\d)\b/i.test(error)) return true;
  if (/NHTSA API error:\s*[1-4]\d\d\b/i.test(error)) return false;
  return (
    /fetch failed/i.test(error) ||
    /failed to fetch|network error/i.test(error) ||
    RETRYABLE_CODE.test(error) ||
    /aborted|timeout|TimeoutError|AbortError/i.test(error) ||
    /Unexpected token|invalid json|not valid JSON|JSON\.parse/i.test(error)
  );
}

export function isRetryableVinDecodeFailure(err: unknown): boolean {
  if (err == null) return false;
  if (typeof err === 'string') return isRetryableVinDecodeError(err);
  if (err instanceof SyntaxError) return true;
  const name = err instanceof Error ? err.name : '';
  if (name === 'TimeoutError' || name === 'AbortError' || name === 'DOMException') {
    return true;
  }
  const code = networkErrorCode(err);
  if (code && RETRYABLE_CODE.test(code)) return true;
  const message = err instanceof Error ? err.message : String(err);
  return isRetryableVinDecodeError(message);
}

export function vinDecodeIsRetryable(result: Pick<VinDecodeResult, 'error' | 'retryable'>): boolean {
  if (result.retryable === true) return true;
  if (result.retryable === false) return false;
  return isRetryableVinDecodeError(result.error);
}

function truncateToLimit(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trim();
}

export function formatDealerMake(value: string): string {
  return value
    .trim()
    .split(/([\s-]+)/)
    .map((part) => {
      if (!part || /^[\s-]+$/.test(part)) return part;
      const upper = part.toUpperCase();
      if (MAKE_ACRONYMS.has(upper)) return upper;
      return (
        part.charAt(0).toLocaleUpperCase('fr-CA') +
        part.slice(1).toLocaleLowerCase('fr-CA')
      );
    })
    .join('');
}

export function mapVpicBodyStyle(value: string): string {
  const n = value.toLocaleLowerCase('fr-CA');
  if (/suv|sport utility|multipurpose|vus|crossover/.test(n)) return 'VUS';
  if (/pickup|pick-up|camionnette/.test(n)) return 'Camionnette';
  if (/truck|camion/.test(n)) return 'Camions';
  if (/sedan|berline/.test(n)) return 'Berline';
  if (/coup[ée]/.test(n)) return 'Coupé';
  if (/hatch|hayon/.test(n)) return 'Hayon';
  if (/minivan|fourgonnette/.test(n)) return 'Fourgonnette';
  if (/\bvan\b|fourgon/.test(n)) return 'Fourgon';
  if (/wagon|familiale/.test(n)) return 'Familiale';
  if (/convertible|d[ée]capot/.test(n)) return 'Décapotable';
  return truncateToLimit(value, VIN_DECODE_STRING_LIMITS.bodyStyle);
}

export function mapVpicFuelType(value: string): string {
  const n = value.toLocaleLowerCase('fr-CA');
  if (/diesel/.test(n)) return 'Diesel';
  if (/electric|électrique/.test(n)) return 'Électrique';
  if (/plug|phev|rechargeable/.test(n)) return 'Hybride rechargeable';
  if (/hybrid|hybride/.test(n)) return 'Hybride';
  if (/flex/.test(n)) return 'Flex';
  if (/gas|gasoline|petrol|essence/.test(n)) return 'Essence';
  return truncateToLimit(value, VIN_DECODE_STRING_LIMITS.fuelType);
}

export function mapVpicTransmission(value: string): string {
  const n = value.toLocaleLowerCase('fr-CA');
  if (/manu/.test(n)) return 'Manuelle';
  if (/\bcvt\b/.test(n)) return 'CVT';
  if (/auto/.test(n)) return 'Auto.';
  return truncateToLimit(value, VIN_DECODE_STRING_LIMITS.transmission);
}

export function mapVpicDrivetrain(value: string): string {
  const n = value.toLocaleLowerCase('fr-CA');
  if (/awd|all-wheel|int[ée]grale/.test(n)) return 'Intégrale';
  if (/4x4|4wd|four-wheel/.test(n)) return '4x4';
  if (/fwd|front-wheel|avant/.test(n)) return 'Traction avant';
  if (/rwd|rear-wheel|arri[eè]re/.test(n)) return 'Propulsion';
  return truncateToLimit(value, VIN_DECODE_STRING_LIMITS.drivetrain);
}

/** Translate vPIC English dumps into the site's French dealer vocabulary and truncate. */
export function normalizeVinDecodeResult(decoded: VinDecodeResult): VinDecodeResult {
  const next: VinDecodeResult = { ...decoded };
  if (next.make) next.make = truncateToLimit(formatDealerMake(next.make), VIN_DECODE_STRING_LIMITS.make);
  if (next.model) next.model = truncateToLimit(next.model, VIN_DECODE_STRING_LIMITS.model);
  if (next.trim) next.trim = truncateToLimit(next.trim, VIN_DECODE_STRING_LIMITS.trim);
  if (next.bodyStyle) next.bodyStyle = mapVpicBodyStyle(next.bodyStyle);
  if (next.fuelType) next.fuelType = mapVpicFuelType(next.fuelType);
  if (next.transmission) next.transmission = mapVpicTransmission(next.transmission);
  if (next.drivetrain) next.drivetrain = mapVpicDrivetrain(next.drivetrain);
  if (next.engine) next.engine = truncateToLimit(next.engine, VIN_DECODE_STRING_LIMITS.engine);
  return next;
}

export function parseVpicErrorCodes(raw?: string): number[] {
  if (!raw) return [0];
  const codes = raw
    .split(/[;,]/)
    .map((part) => parseInt(part.trim(), 10))
    .filter((n) => !Number.isNaN(n));
  return codes.length ? codes : [0];
}

/**
 * Accept informative / partial vPIC codes when year, make and model are present
 * (8, 14, and 4 with recoverable data). Reject check-digit / missing VIN.
 */
export function canAcceptPartialVinDecode(
  codes: number[],
  year?: number,
  make?: string,
  model?: string,
): boolean {
  if (codes.every((code) => code === 0)) return true;
  if (codes.includes(1) || codes.includes(5) || codes.includes(9)) return false;
  const hasCore = Boolean(year && make && model);
  if (!hasCore) return false;
  return true;
}

function formatCaughtVinDecodeError(err: unknown): string {
  if (!(err instanceof Error)) return 'VIN decode failed';
  const code = networkErrorCode(err);
  if (code) return `${err.message} (${code})`;
  return err.message;
}

export async function decodeVin(vin: string): Promise<VinDecodeResult> {
  const normalized = normalizeVin(vin);

  if (!isValidVinFormat(normalized)) {
    return {
      vin: normalized,
      error: 'Invalid VIN format. Must be 17 characters.',
      retryable: false,
    };
  }

  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${normalized}?format=json`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(VIN_DECODE_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      return {
        vin: normalized,
        error: `NHTSA API error: ${response.status}`,
        retryable,
      };
    }

    let data: NhtsaResponse;
    try {
      data = (await response.json()) as NhtsaResponse;
    } catch (err) {
      return {
        vin: normalized,
        error: formatCaughtVinDecodeError(err),
        retryable: true,
      };
    }

    const results = data.Results ?? [];
    const yearStr = getValue(results, 'Model Year');
    const doorsStr = getValue(results, 'Doors');
    const cylStr = getValue(results, 'Engine Number of Cylinders');
    const year = yearStr ? parseInt(yearStr, 10) : undefined;
    const make = getValue(results, 'Make');
    const model = getValue(results, 'Model');

    const errorCode = getValue(results, 'Error Code');
    const codes = parseVpicErrorCodes(errorCode);
    if (!canAcceptPartialVinDecode(codes, year, make, model)) {
      const errorText = getValue(results, 'Error Text');
      return {
        vin: normalized,
        error: errorText ?? 'VIN decode failed',
        retryable: false,
      };
    }

    return normalizeVinDecodeResult({
      vin: normalized,
      year,
      make,
      model,
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
    });
  } catch (err) {
    return {
      vin: normalized,
      error: formatCaughtVinDecodeError(err),
      retryable: isRetryableVinDecodeFailure(err) || !(err instanceof Error),
    };
  }
}
