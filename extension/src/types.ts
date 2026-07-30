export interface PreparationPayload {
  contractVersion: 1;
  listingId: string;
  vehicleId: string;
  title: string;
  price: number;
  description: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  vin: string | null;
  photos: string[];
  policy: { autoSubmit: false; humanConfirmationRequired: true };
  expiresAt: string;
}

export interface FillResult {
  filled: string[];
  missing: string[];
  message: string;
}
