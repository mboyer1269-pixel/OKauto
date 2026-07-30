export interface MarketplaceFields {
  title: string;
  vehicleType: string;
  year: string | null;
  make: string;
  model: string;
  trim: string | null;
  mileage: string | null;
  price: string | null;
  bodyStyle: string;
  condition: string;
  fuelType: string;
  transmission: string;
  exteriorColor: string | null;
  interiorColor: string | null;
  description: string;
}

export interface ExtVehicle {
  id: string;
  vin: string | null;
  stockNumber: string | null;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  priceCents: number | null;
  status: string;
  description: string | null;
  photos: string[];
  marketplaceFields: MarketplaceFields;
  activeListings: Array<{ id: string; status: string; mine: boolean; by: string }>;
}

export interface Bootstrap {
  user: { id: string; name: string; email: string; role: string };
  organization: {
    id: string;
    name: string;
    phone: string | null;
    settings: { defaultLocation: string | null };
  };
  counts: { pendingDelists: number; activeListings: number; unreadNotifications: number };
}

export interface ExtListing {
  id: string;
  status: string;
  externalUrl: string | null;
  vehicle: {
    id: string;
    year: number | null;
    make: string;
    model: string;
    trim: string | null;
    stockNumber: string | null;
    status: string;
  };
}

export interface Settings {
  apiBaseUrl: string;
  token: string;
}

/** Messages between popup/content script and the background service worker. */
export type BgRequest =
  | { kind: "getSettings" }
  | { kind: "saveSettings"; settings: Settings }
  | { kind: "clearSettings" }
  | { kind: "bootstrap" }
  | { kind: "listVehicles"; q?: string; page?: number }
  | { kind: "myListings"; status?: string }
  | { kind: "startListing"; vehicleId: string; force?: boolean }
  | { kind: "reportEvent"; listingId: string; type: string; data?: Record<string, unknown> }
  | { kind: "setListingStatus"; listingId: string; status: string; externalUrl?: string; errorMessage?: string };

export type BgResponse<T = unknown> = { ok: true; data: T } | { ok: false; status?: number; error: string };
