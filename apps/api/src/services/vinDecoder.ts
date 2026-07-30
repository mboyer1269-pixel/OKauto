import {
  normalizeBodyStyle,
  normalizeDrivetrain,
  normalizeFuelType,
  normalizeTransmission,
  parseIntSafe,
  validateVin,
} from "@openlot/shared";
import type { VinInfo } from "@openlot/shared";

export interface DecodedVehicleHints {
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  bodyStyle?: string;
  transmission?: string;
  fuelType?: string;
  drivetrain?: string;
  engine?: string;
  doors?: number;
}

export interface VinDecodeResult {
  vin: string;
  valid: boolean;
  error?: string;
  offline: Omit<VinInfo, "vin" | "valid" | "error">;
  /** Enriched attributes from the public NHTSA vPIC decoder, when available. */
  decoded?: DecodedVehicleHints;
  decoderSource?: "NHTSA" | "OFFLINE";
}

type FetchLike = typeof fetch;

export function createVinDecoder(options: { enableNhtsa: boolean; fetchImpl?: FetchLike }) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function decodeWithNhtsa(vin: string): Promise<DecodedVehicleHints | null> {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const data = (await response.json()) as { Results?: Record<string, string>[] };
    const row = data.Results?.[0];
    if (!row) return null;
    const engineParts = [
      row.DisplacementL ? `${Number(row.DisplacementL).toFixed(1)}L` : "",
      row.EngineCylinders ? `${row.EngineCylinders}-cyl` : "",
    ].filter(Boolean);
    return {
      year: parseIntSafe(row.ModelYear) || undefined,
      make: titleCase(row.Make),
      model: row.Model || undefined,
      trim: row.Trim || undefined,
      bodyStyle: normalizeBodyStyle(row.BodyClass),
      transmission: normalizeTransmission(row.TransmissionStyle),
      fuelType: normalizeFuelType(row.FuelTypePrimary),
      drivetrain: normalizeDrivetrain(row.DriveType),
      engine: engineParts.length ? engineParts.join(" ") : undefined,
      doors: parseIntSafe(row.Doors) || undefined,
    };
  }

  return async function decodeVin(rawVin: string): Promise<VinDecodeResult> {
    const info = validateVin(rawVin);
    const { vin, valid, error, ...offline } = info;
    const result: VinDecodeResult = { vin, valid, error, offline, decoderSource: "OFFLINE" };
    if (!valid || !options.enableNhtsa) return result;
    try {
      const decoded = await decodeWithNhtsa(vin);
      if (decoded && (decoded.make || decoded.model)) {
        result.decoded = decoded;
        result.decoderSource = "NHTSA";
      }
    } catch {
      // Network failure is non-fatal; offline data is still returned.
    }
    return result;
  };
}

function titleCase(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw
    .split(/\s+/)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

export type VinDecoderFn = ReturnType<typeof createVinDecoder>;
