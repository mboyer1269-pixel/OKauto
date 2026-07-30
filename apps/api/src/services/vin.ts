/**
 * Lightweight VIN decode via NHTSA VPIC (public, free).
 * Used for normalization enrichment — never blocks imports on failure.
 */
export type VinDecodeResult = {
  year?: number;
  make?: string;
  model?: string;
  bodyStyle?: string;
  fuelType?: string;
  drivetrain?: string;
  raw?: Record<string, string>;
};

export async function decodeVin(vin: string): Promise<VinDecodeResult | null> {
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      Results?: Array<Record<string, string>>;
    };
    const row = data.Results?.[0];
    if (!row) return null;
    const year = Number(row.ModelYear);
    return {
      year: Number.isFinite(year) && year > 0 ? year : undefined,
      make: row.Make || undefined,
      model: row.Model || undefined,
      bodyStyle: row.BodyClass || undefined,
      fuelType: row.FuelTypePrimary || undefined,
      drivetrain: row.DriveType || undefined,
      raw: row,
    };
  } catch {
    return null;
  }
}
