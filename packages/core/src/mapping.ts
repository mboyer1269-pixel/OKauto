import { z } from "zod";
import { type VehicleInput } from "./types.js";

/**
 * Field-mapping configuration for CSV / JSON feed sources: maps LotPilot
 * vehicle fields to source column names / JSON paths. `photoUrls` may map to a
 * single delimited column or an array field.
 */
export const fieldMappingSchema = z.object({
  vin: z.string().optional(),
  stockNumber: z.string().optional(),
  year: z.string().optional(),
  make: z.string(),
  model: z.string(),
  trim: z.string().optional(),
  bodyStyle: z.string().optional(),
  drivetrain: z.string().optional(),
  transmission: z.string().optional(),
  fuelType: z.string().optional(),
  engine: z.string().optional(),
  exteriorColor: z.string().optional(),
  interiorColor: z.string().optional(),
  mileage: z.string().optional(),
  price: z.string().optional(),
  condition: z.string().optional(),
  description: z.string().optional(),
  photoUrls: z.string().optional(),
  photoDelimiter: z.string().default("|"),
});

export type FieldMapping = z.infer<typeof fieldMappingSchema>;

/** Sensible defaults matching common DMS export headers. */
export const DEFAULT_FIELD_MAPPING: FieldMapping = {
  vin: "VIN",
  stockNumber: "Stock",
  year: "Year",
  make: "Make",
  model: "Model",
  trim: "Trim",
  bodyStyle: "Body",
  drivetrain: "Drivetrain",
  transmission: "Transmission",
  fuelType: "Fuel",
  engine: "Engine",
  exteriorColor: "ExteriorColor",
  interiorColor: "InteriorColor",
  mileage: "Mileage",
  price: "Price",
  condition: "Condition",
  description: "Description",
  photoUrls: "Photos",
  photoDelimiter: "|",
};

/** Case-insensitive lookup with dot-path support for nested JSON feeds. */
function getPath(record: Record<string, unknown>, path: string): unknown {
  if (path in record) return record[path];
  // case-insensitive top-level match
  const lower = path.toLowerCase();
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lower) return record[key];
  }
  if (path.includes(".")) {
    let cur: unknown = record;
    for (const part of path.split(".")) {
      if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return cur;
  }
  return undefined;
}

/** Apply a field mapping to a raw source record, producing pre-normalization input. */
export function applyFieldMapping(
  record: Record<string, unknown>,
  mapping: FieldMapping,
): Partial<VehicleInput> & Record<string, unknown> {
  const get = (key: string | undefined): unknown => (key ? getPath(record, key) : undefined);

  let photoUrls: string[] = [];
  const rawPhotos = get(mapping.photoUrls);
  if (Array.isArray(rawPhotos)) {
    photoUrls = rawPhotos.filter((p): p is string => typeof p === "string");
  } else if (typeof rawPhotos === "string" && rawPhotos.trim() !== "") {
    photoUrls = rawPhotos
      .split(mapping.photoDelimiter)
      .map((p) => p.trim())
      .filter((p) => p !== "");
  }

  const asStr = (v: unknown): string | undefined =>
    v === null || v === undefined ? undefined : String(v);

  return {
    vin: asStr(get(mapping.vin)),
    stockNumber: asStr(get(mapping.stockNumber)),
    year: get(mapping.year) as VehicleInput["year"],
    make: asStr(get(mapping.make)) ?? "",
    model: asStr(get(mapping.model)) ?? "",
    trim: asStr(get(mapping.trim)),
    bodyStyle: asStr(get(mapping.bodyStyle)),
    drivetrain: asStr(get(mapping.drivetrain)),
    transmission: asStr(get(mapping.transmission)),
    fuelType: asStr(get(mapping.fuelType)),
    engine: asStr(get(mapping.engine)),
    exteriorColor: asStr(get(mapping.exteriorColor)),
    interiorColor: asStr(get(mapping.interiorColor)),
    mileage: get(mapping.mileage) as VehicleInput["mileage"],
    priceCents: get(mapping.price) as VehicleInput["priceCents"],
    condition: asStr(get(mapping.condition)) as VehicleInput["condition"],
    description: asStr(get(mapping.description)),
    photoUrls,
  };
}
