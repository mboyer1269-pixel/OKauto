import { decodeVin, type VinDecodeResult } from "@okauto/shared";
import type { AppConfig } from "../config.js";

export interface VinDecoderProvider {
  readonly name: string;
  decode(vin: string): Promise<VinDecodeResult>;
}

/** Offline deterministic decoder (ISO 3779 + public WMI tables). Default. */
export class LocalVinDecoder implements VinDecoderProvider {
  readonly name = "local";
  async decode(vin: string): Promise<VinDecodeResult> {
    return decodeVin(vin);
  }
}

/**
 * Optional enrichment via the public NHTSA vPIC API (no key required).
 * Falls back to the local decoder on any network/parsing failure.
 */
export class VpicVinDecoder implements VinDecoderProvider {
  readonly name = "vpic";
  private readonly fallback = new LocalVinDecoder();
  private readonly timeoutMs: number;

  constructor(timeoutMs = 8000) {
    this.timeoutMs = timeoutMs;
  }

  async decode(vin: string): Promise<VinDecodeResult> {
    const local = await this.fallback.decode(vin);
    if (!local.valid) return local;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`,
        { signal: controller.signal },
      );
      clearTimeout(timer);
      if (!res.ok) return local;
      const json = (await res.json()) as { Results?: { ModelYear?: string; Make?: string }[] };
      const row = json.Results?.[0];
      if (!row) return local;
      const year = row.ModelYear ? Number.parseInt(row.ModelYear, 10) : undefined;
      return {
        ...local,
        modelYear: Number.isFinite(year) ? year : local.modelYear,
        wmiMake: row.Make || local.wmiMake,
      };
    } catch {
      return local;
    }
  }
}

export function createVinDecoder(config: AppConfig): VinDecoderProvider {
  return config.VIN_PROVIDER === "vpic" ? new VpicVinDecoder() : new LocalVinDecoder();
}
