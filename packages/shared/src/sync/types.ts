export interface SyncVehicle {
  vin?: string | null;
  stockNumber?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  mileage?: number | null;
  price?: number | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  description?: string | null;
  transmission?: string | null;
  fuelType?: string | null;
  drivetrain?: string | null;
  engine?: string | null;
  bodyStyle?: string | null;
  status?: 'AVAILABLE' | 'PENDING' | 'SOLD' | 'ARCHIVED' | string;
  photos?: string[];
}

export interface SyncAdapter {
  name: string;
  parse(body: string, contentType?: string | null): SyncVehicle[];
}

export const SYNC_ADAPTERS = ['generic', 'dealer-json', 'json-ld'] as const;
export type SyncAdapterName = (typeof SYNC_ADAPTERS)[number];
