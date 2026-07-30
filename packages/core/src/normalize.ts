import { normalizeVin, isValidVin } from "./vin.js";
import { type VehicleCondition, type VehicleInput } from "./types.js";

/** Parse "$24,995", "24995.00", "24 995" etc. into integer cents. */
export function parsePriceToCents(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return null;
    return Math.round(raw * 100);
  }
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/USD/i, "");
  if (cleaned === "") return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Parse "42,113 mi", "42113", "42k" into integer miles. */
export function parseMileage(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;
  const cleaned = raw.toLowerCase().replace(/miles|mi\.?|,|\s/g, "");
  if (cleaned === "") return null;
  const kMatch = cleaned.match(/^(\d+(?:\.\d+)?)k$/);
  const value = kMatch ? Number.parseFloat(kMatch[1]!) * 1000 : Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

export function normalizeCondition(raw: string | null | undefined): VehicleCondition {
  if (!raw) return "USED";
  const c = raw.trim().toLowerCase();
  if (["new"].includes(c)) return "NEW";
  if (["cpo", "certified", "certified pre-owned", "certified pre owned", "certified_pre_owned"].includes(c)) {
    return "CERTIFIED_PRE_OWNED";
  }
  return "USED";
}

const UPPER_MAKES = new Set(["BMW", "GMC", "MINI"]);

export function normalizeMake(raw: string): string {
  const trimmed = raw.trim();
  if (UPPER_MAKES.has(trimmed.toUpperCase())) return trimmed.toUpperCase();
  if (trimmed.toUpperCase() === "MERCEDES-BENZ" || trimmed.toUpperCase() === "MERCEDES BENZ") {
    return "Mercedes-Benz";
  }
  return trimmed
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export interface NormalizationIssue {
  field: string;
  message: string;
}

export interface NormalizedVehicle extends VehicleInput {
  issues: NormalizationIssue[];
}

/**
 * Normalize a raw (already field-mapped) record. Non-fatal problems (bad VIN,
 * unparseable price) become issues; the record is still usable if make/model exist.
 */
export function normalizeVehicle(raw: Partial<VehicleInput> & Record<string, unknown>): NormalizedVehicle | { error: string } {
  const issues: NormalizationIssue[] = [];

  const make = typeof raw.make === "string" ? raw.make.trim() : "";
  const model = typeof raw.model === "string" ? raw.model.trim() : "";
  if (!make || !model) return { error: "make and model are required" };

  let vin: string | null = null;
  if (typeof raw.vin === "string" && raw.vin.trim() !== "") {
    const candidate = normalizeVin(raw.vin);
    if (isValidVin(candidate)) {
      vin = candidate;
    } else {
      issues.push({ field: "vin", message: `Invalid VIN "${candidate}" (check digit or format); stored without VIN` });
    }
  }

  const priceCents =
    typeof raw.priceCents === "number"
      ? raw.priceCents
      : parsePriceToCents(raw.priceCents as string | number | null | undefined);
  if (raw.priceCents !== undefined && raw.priceCents !== null && priceCents === null) {
    issues.push({ field: "price", message: `Could not parse price "${String(raw.priceCents)}"` });
  }

  const mileage = parseMileage(raw.mileage as string | number | null | undefined);

  let year: number | null = null;
  if (raw.year !== undefined && raw.year !== null && String(raw.year).trim() !== "") {
    const parsed = Number.parseInt(String(raw.year), 10);
    if (Number.isInteger(parsed) && parsed >= 1900 && parsed <= new Date().getFullYear() + 2) {
      year = parsed;
    } else {
      issues.push({ field: "year", message: `Ignored implausible year "${String(raw.year)}"` });
    }
  }

  const str = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t === "" ? null : t;
  };

  const photoUrls = Array.isArray(raw.photoUrls)
    ? raw.photoUrls.filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 50)
    : [];

  return {
    vin,
    stockNumber: str(raw.stockNumber),
    category: (raw.category as VehicleInput["category"]) ?? "AUTO",
    year,
    make: normalizeMake(make),
    model,
    trim: str(raw.trim),
    bodyStyle: str(raw.bodyStyle),
    drivetrain: str(raw.drivetrain),
    transmission: str(raw.transmission),
    fuelType: str(raw.fuelType),
    engine: str(raw.engine),
    exteriorColor: str(raw.exteriorColor),
    interiorColor: str(raw.interiorColor),
    mileage,
    priceCents,
    condition: normalizeCondition(raw.condition as string | null | undefined),
    description: str(raw.description),
    photoUrls,
    sourceRef: str(raw.sourceRef),
    issues,
  };
}

/**
 * Stable identity key for duplicate prevention.
 * Priority: VIN → stock number → year/make/model/mileage-bucket fingerprint.
 */
export function dedupeKey(v: {
  vin?: string | null;
  stockNumber?: string | null;
  year?: number | null;
  make: string;
  model: string;
  mileage?: number | null;
}): string {
  if (v.vin) return `vin:${v.vin.toUpperCase()}`;
  if (v.stockNumber) return `stock:${v.stockNumber.trim().toLowerCase()}`;
  const mileageBucket = v.mileage != null ? Math.round(v.mileage / 500) : "na";
  return `fp:${v.year ?? "?"}|${v.make.toLowerCase()}|${v.model.toLowerCase()}|${mileageBucket}`;
}
