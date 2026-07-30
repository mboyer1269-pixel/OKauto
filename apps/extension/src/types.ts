/** Shared message and data types for the extension. */

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
  orgs: { orgId: string; name: string; slug: string; role: string }[];
  currentOrgId: string | null;
  apiUrl: string;
}

export interface MarketplaceDraft {
  vehicleId: string;
  vehicleType: string;
  year: string;
  make: string;
  model: string;
  mileage?: string;
  price?: string;
  bodyStyleLabels?: string[];
  exteriorColor?: string;
  interiorColor?: string;
  conditionLabels?: string[];
  fuelLabels?: string[];
  transmissionLabels?: string[];
  title: string;
  description: string;
  photoUrls: string[];
}

export interface PendingListing {
  listingId: string;
  orgId: string;
  draft: MarketplaceDraft;
  createdAt: number;
}

export type ExtMessage =
  | { kind: "START_LISTING"; pending: Omit<PendingListing, "createdAt"> }
  | { kind: "GET_PENDING" }
  | { kind: "LISTING_EVENT"; type: "PREPARED" | "PUBLISHED" | "REMOVED" | "FAILED"; message?: string; remoteUrl?: string }
  | { kind: "CLEAR_PENDING" }
  | { kind: "REFRESH_BADGE" };

export interface MessageResponse {
  ok: boolean;
  error?: string;
  pending?: PendingListing | null;
}
