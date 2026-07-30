/**
 * Vehicle normalization: turn messy import rows into a consistent NormalizedVehicle.
 * Handles currency/mileage parsing, enum coercion, feature splitting, title building.
 */
import type {
  FuelType,
  NormalizedVehicle,
  Transmission,
  VehicleCategory,
} from './types.js';
import { normalizeVin } from './vin.js';

export interface RawVehicleInput {
  vin?: string | null;
  stockNumber?: string | null;
  category?: string | null;
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  bodyStyle?: string | null;
  mileage?: string | number | null;
  price?: string | number | null;
  priceCents?: number | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  engine?: string | null;
  features?: string | string[] | null;
  condition?: string | null;
}

const CATEGORY_ALIASES: Record<string, VehicleCategory> = {
  auto: 'AUTOMOTIVE',
  automotive: 'AUTOMOTIVE',
  car: 'AUTOMOTIVE',
  truck: 'AUTOMOTIVE',
  suv: 'AUTOMOTIVE',
  rv: 'RV_TRAILER',
  trailer: 'RV_TRAILER',
  camper: 'RV_TRAILER',
  marine: 'MARINE_POWERSPORTS',
  boat: 'MARINE_POWERSPORTS',
  powersports: 'MARINE_POWERSPORTS',
  motorcycle: 'MARINE_POWERSPORTS',
  'mobile home': 'MOBILE_HOME',
  'real estate': 'REAL_ESTATE',
  farm: 'FARM_EQUIPMENT',
  equipment: 'FARM_EQUIPMENT',
  furniture: 'FURNITURE',
};

const FUEL_ALIASES: Record<string, FuelType> = {
  gas: 'GASOLINE',
  gasoline: 'GASOLINE',
  petrol: 'GASOLINE',
  diesel: 'DIESEL',
  electric: 'ELECTRIC',
  ev: 'ELECTRIC',
  hybrid: 'HYBRID',
  'plug-in hybrid': 'PLUGIN_HYBRID',
  phev: 'PLUGIN_HYBRID',
  flex: 'FLEX',
  'flex fuel': 'FLEX',
};

const TRANSMISSION_ALIASES: Record<string, Transmission> = {
  auto: 'AUTOMATIC',
  automatic: 'AUTOMATIC',
  a: 'AUTOMATIC',
  manual: 'MANUAL',
  m: 'MANUAL',
  stick: 'MANUAL',
  cvt: 'CVT',
};

export function parsePriceToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function parseMileage(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input) : null;
  const cleaned = input.replace(/[^0-9]/g, '');
  if (!cleaned) return null;
  const value = Number.parseInt(cleaned, 10);
  return Number.isFinite(value) ? value : null;
}

export function parseYear(
  input: string | number | null | undefined,
  referenceYear = new Date().getUTCFullYear(),
): number | null {
  if (input === null || input === undefined || input === '') return null;
  const value = typeof input === 'number' ? input : Number.parseInt(String(input).trim(), 10);
  if (!Number.isFinite(value)) return null;
  if (value < 1900 || value > referenceYear + 2) return null;
  return value;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ')
    .trim();
}

export function coerceCategory(input?: string | null): VehicleCategory {
  if (!input) return 'AUTOMOTIVE';
  const key = input.trim().toLowerCase();
  return CATEGORY_ALIASES[key] ?? 'OTHER';
}

export function coerceFuelType(input?: string | null): FuelType | null {
  if (!input) return null;
  return FUEL_ALIASES[input.trim().toLowerCase()] ?? null;
}

export function coerceTransmission(input?: string | null): Transmission | null {
  if (!input) return null;
  return TRANSMISSION_ALIASES[input.trim().toLowerCase()] ?? null;
}

export function parseFeatures(input?: string | string[] | null): string[] {
  if (!input) return [];
  const list = Array.isArray(input) ? input : input.split(/[;,|]/);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function buildVehicleTitle(v: {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
}): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ').trim();
}

export function normalizeVehicle(input: RawVehicleInput): NormalizedVehicle {
  const year = parseYear(input.year);
  const make = input.make ? titleCase(input.make) : null;
  const model = input.model ? input.model.trim() : null;
  const trim = input.trim ? input.trim.trim() : null;
  const priceCents = input.priceCents ?? parsePriceToCents(input.price);

  const normalized: NormalizedVehicle = {
    vin: input.vin ? normalizeVin(input.vin) : null,
    stockNumber: input.stockNumber ? input.stockNumber.trim() : null,
    category: coerceCategory(input.category),
    year,
    make,
    model,
    trim,
    bodyStyle: input.bodyStyle ? titleCase(input.bodyStyle) : null,
    mileage: parseMileage(input.mileage),
    priceCents,
    exteriorColor: input.exteriorColor ? titleCase(input.exteriorColor) : null,
    interiorColor: input.interiorColor ? titleCase(input.interiorColor) : null,
    fuelType: coerceFuelType(input.fuelType),
    transmission: coerceTransmission(input.transmission),
    drivetrain: input.drivetrain ? input.drivetrain.trim().toUpperCase() : null,
    engine: input.engine ? input.engine.trim() : null,
    features: parseFeatures(input.features),
    condition: input.condition ? titleCase(input.condition) : null,
    title: '',
  };
  normalized.title = buildVehicleTitle(normalized);
  return normalized;
}

export function formatPrice(priceCents: number | null): string {
  if (priceCents === null) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}

export function formatMileage(mileage: number | null): string {
  if (mileage === null) return '';
  return `${new Intl.NumberFormat('en-US').format(mileage)} mi`;
}
