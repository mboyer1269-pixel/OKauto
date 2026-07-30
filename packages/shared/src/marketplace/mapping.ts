/**
 * Maps a NormalizedVehicle into the fields the Facebook Marketplace *vehicle* composer
 * exposes to a human user. This describes WHAT to pre-fill; the content script decides
 * HOW, and a human always reviews and submits. No automated posting is performed.
 */
import type { NormalizedVehicle } from '../types.js';

export interface MarketplaceVehicleFields {
  /** "Vehicle type" select value (Car/Truck, Motorcycle, etc.) */
  vehicleType: string;
  year: string;
  make: string;
  model: string;
  /** Mileage in miles. */
  mileage: string;
  price: string;
  bodyStyle?: string;
  exteriorColor?: string;
  interiorColor?: string;
  fuelType?: string;
  transmission?: string;
  condition?: string;
  title: string;
  description: string;
  /** Photo source URLs to be attached by the human (the extension queues them). */
  photoUrls: string[];
}

const VEHICLE_TYPE_BY_CATEGORY: Record<string, string> = {
  AUTOMOTIVE: 'Car/Truck',
  RV_TRAILER: 'RV/Camper',
  MARINE_POWERSPORTS: 'Powersport',
  MOBILE_HOME: 'Other',
  REAL_ESTATE: 'Other',
  FARM_EQUIPMENT: 'Commercial/Industrial',
  FURNITURE: 'Other',
  OTHER: 'Other',
};

const FUEL_LABELS: Record<string, string> = {
  GASOLINE: 'Gasoline',
  DIESEL: 'Diesel',
  ELECTRIC: 'Electric',
  HYBRID: 'Hybrid',
  PLUGIN_HYBRID: 'Plug-in hybrid',
  FLEX: 'Flex',
  OTHER: 'Other',
};

const TRANSMISSION_LABELS: Record<string, string> = {
  AUTOMATIC: 'Automatic transmission',
  MANUAL: 'Manual transmission',
  CVT: 'Automatic transmission',
  OTHER: 'Automatic transmission',
};

export function mapVehicleToMarketplace(
  v: NormalizedVehicle,
  description: string,
  photoUrls: string[] = [],
): MarketplaceVehicleFields {
  return {
    vehicleType: VEHICLE_TYPE_BY_CATEGORY[v.category] ?? 'Car/Truck',
    year: v.year ? String(v.year) : '',
    make: v.make ?? '',
    model: v.model ?? '',
    mileage: v.mileage !== null ? String(v.mileage) : '',
    price: v.priceCents !== null ? String(Math.round(v.priceCents / 100)) : '',
    bodyStyle: v.bodyStyle ?? undefined,
    exteriorColor: v.exteriorColor ?? undefined,
    interiorColor: v.interiorColor ?? undefined,
    fuelType: v.fuelType ? FUEL_LABELS[v.fuelType] : undefined,
    transmission: v.transmission ? TRANSMISSION_LABELS[v.transmission] : undefined,
    condition: v.condition ?? undefined,
    title: v.title,
    description,
    photoUrls,
  };
}
