import {
  classifyInventoryKind,
  generateCatalogDescription,
  generateListingTitle,
  type VehicleData,
} from "./description";

export const META_VEHICLE_CATALOG_HEADERS = [
  "vehicle_id",
  "vin",
  "title",
  "description",
  "url",
  "make",
  "model",
  "year",
  "trim",
  "mileage.value",
  "mileage.unit",
  "price",
  "state_of_vehicle",
  "exterior_color",
  "interior_color",
  "body_style",
  "transmission",
  "fuel_type",
  "drivetrain",
  "image[0].url",
  "image[1].url",
  "address",
  "date_first_on_lot",
  "availability",
  "dealer_name",
  "dealer_phone",
] as const;

export interface MetaCatalogVehicleInput {
  id: string;
  vin?: string | null;
  stockNumber?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  mileage?: number | null;
  advertisedPrice?: number | null;
  price?: number | null;
  bodyStyle?: string | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  condition?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[];
  status?: string | null;
  transmission?: string | null;
  fuelType?: string | null;
  drivetrain?: string | null;
  createdAt?: Date | string | null;
}

export interface MetaCatalogDealerInput {
  name: string;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  metaCatalogStateForDemo?: "Used" | "New" | string | null;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function clean(value?: string | number | null): string {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

export function mapMetaBodyStyle(value?: string | null): string {
  const raw = clean(value).toLocaleLowerCase("fr-CA");
  if (!raw) return "OTHER";
  if (/(vus|suv)/.test(raw)) return "SUV";
  if (/(camionnette|pickup|pick-up)/.test(raw)) return "PICKUP";
  if (/truck|camion/.test(raw)) return "TRUCK";
  if (/(berline|sedan)/.test(raw)) return "SEDAN";
  if (/(fourgonnette|minivan)/.test(raw)) return "MINIVAN";
  if (/van|fourgon/.test(raw)) return "VAN";
  if (/(coup[ée]|coupe)/.test(raw)) return "COUPE";
  if (/(hayon|hatch)/.test(raw)) return "HATCHBACK";
  if (/(familiale|wagon)/.test(raw)) return "WAGON";
  if (/crossover/.test(raw)) return "CROSSOVER";
  if (/convertible|d[ée]capot/.test(raw)) return "CONVERTIBLE";
  return "OTHER";
}

export function mapMetaTransmission(value?: string | null): string {
  const raw = clean(value).toLocaleLowerCase("fr-CA");
  if (/manu/.test(raw)) return "MANUAL";
  if (/auto|cvt/.test(raw)) return "AUTOMATIC";
  return raw ? "OTHER" : "";
}

export function mapMetaFuel(value?: string | null): string {
  const raw = clean(value).toLocaleLowerCase("fr-CA");
  if (/diesel/.test(raw)) return "DIESEL";
  if (/elect|élect/.test(raw)) return "ELECTRIC";
  if (/hybr/.test(raw)) return "HYBRID";
  if (/flex/.test(raw)) return "FLEX";
  if (/gas|essence|regular/.test(raw)) return "GASOLINE";
  return raw ? "OTHER" : "";
}

export function mapMetaDrivetrain(value?: string | null): string {
  const raw = clean(value).toLocaleLowerCase("fr-CA");
  if (/4x4|4wd/.test(raw)) return "4X4";
  if (/awd|int[ée]grale/.test(raw)) return "AWD";
  if (/fwd|avant/.test(raw)) return "FWD";
  if (/rwd|arri[eè]re/.test(raw)) return "RWD";
  return raw ? "OTHER" : "";
}

export function metaStateOfVehicle(
  vehicle: MetaCatalogVehicleInput,
  dealer?: MetaCatalogDealerInput,
): "New" | "Used" | "CPO" {
  const kind = classifyInventoryKind({
    condition: vehicle.condition,
    mileage: vehicle.mileage,
    stockNumber: vehicle.stockNumber,
    sourceUrl: vehicle.sourceUrl,
  });
  const condition = clean(vehicle.condition).toLocaleLowerCase("fr-CA");
  if (condition.includes("cpo") || condition.includes("certif")) return "CPO";
  if (kind === "new") return "New";
  if (kind === "demo") {
    return dealer?.metaCatalogStateForDemo === "New" ? "New" : "Used";
  }
  return "Used";
}

function catalogAddress(dealer: MetaCatalogDealerInput): string {
  return JSON.stringify({
    addr1: clean(dealer.address),
    city: clean(dealer.city),
    region: clean(dealer.state) || "QC",
    postal_code: clean(dealer.zip),
    country: "Canada",
  });
}

export function toMetaVehicleRow(
  vehicle: MetaCatalogVehicleInput,
  dealer: MetaCatalogDealerInput,
): Record<(typeof META_VEHICLE_CATALOG_HEADERS)[number], string> {
  return toMetaVehicleCatalogRow(vehicle, dealer);
}

export function toMetaVehicleCatalogRow(
  vehicle: MetaCatalogVehicleInput,
  dealer: MetaCatalogDealerInput,
): Record<(typeof META_VEHICLE_CATALOG_HEADERS)[number], string> {
  const title = generateListingTitle(vehicle as VehicleData).slice(0, 500);
  const priceValue = vehicle.advertisedPrice ?? vehicle.price;
  const url = clean(vehicle.sourceUrl) || clean(dealer.website);
  const images = (vehicle.imageUrls?.length
    ? vehicle.imageUrls
    : [vehicle.imageUrl]
  )
    .map((value) => clean(value))
    .filter((value) => value.startsWith("https://"))
    .slice(0, 20);
  const state = metaStateOfVehicle(vehicle, dealer);
  const mileage =
    state === "New" ? 0 : vehicle.mileage == null ? "" : String(vehicle.mileage);
  const createdAt = vehicle.createdAt
    ? new Date(vehicle.createdAt).toISOString().slice(0, 10)
    : "";
  const description = (
    clean(vehicle.description) || generateCatalogDescription(vehicle as VehicleData)
  ).slice(0, 5000);

  return {
    vehicle_id: clean(vehicle.vin) || clean(vehicle.stockNumber) || vehicle.id,
    vin: clean(vehicle.vin),
    title,
    description,
    url,
    make: clean(vehicle.make),
    model: clean(vehicle.model),
    year: vehicle.year == null ? "" : String(vehicle.year),
    trim: clean(vehicle.trim).slice(0, 50),
    "mileage.value": mileage === "" ? "" : String(mileage),
    "mileage.unit": "KM",
    price: priceValue == null ? "" : `${Math.round(Number(priceValue))} CAD`,
    state_of_vehicle: state,
    exterior_color: clean(vehicle.exteriorColor),
    interior_color: clean(vehicle.interiorColor),
    body_style: mapMetaBodyStyle(vehicle.bodyStyle),
    transmission: mapMetaTransmission(vehicle.transmission),
    fuel_type: mapMetaFuel(vehicle.fuelType),
    drivetrain: mapMetaDrivetrain(vehicle.drivetrain),
    "image[0].url": images[0] ?? "",
    "image[1].url": images[1] ?? "",
    address: catalogAddress(dealer),
    date_first_on_lot: createdAt,
    availability: vehicle.status === "SOLD" || vehicle.status === "ARCHIVED"
      ? "not_available"
      : "available",
    dealer_name: clean(dealer.name),
    dealer_phone: clean(dealer.phone),
  };
}

export function validateMetaVehicleRow(
  row: Record<string, string>,
): { excluded: string[]; warnings: string[] } {
  const excluded: string[] = [];
  const warnings: string[] = [];
  if (!row.price) excluded.push("Prix manquant");
  if (!row.vehicle_id) excluded.push("NIV et numéro de stock manquants");
  if (!row.year || !row.make || !row.model) excluded.push("Année, marque ou modèle manquant");
  if (!row.url) excluded.push("URL manquante");
  if (!row["image[0].url"]) excluded.push("Aucune photo");
  if (!row.exterior_color) excluded.push("Couleur extérieure manquante");
  const address = row.address ? JSON.parse(row.address) as { city?: string; region?: string } : {};
  if (!address.city || !address.region) excluded.push("Adresse de la concession incomplète");
  if (!row["image[1].url"]) {
    warnings.push("Moins de 2 photos : non admissible au placement Marketplace");
  }
  if (
    row.state_of_vehicle === "Used" &&
    Number(row["mileage.value"] || 0) <= 500
  ) {
    warnings.push("non admissible au placement Marketplace");
  }
  return { excluded, warnings };
}

export function buildMetaVehicleCatalogCsv(
  vehicles: MetaCatalogVehicleInput[],
  dealer: MetaCatalogDealerInput,
): string {
  const header = META_VEHICLE_CATALOG_HEADERS.join(",");
  const rows = vehicles.map((vehicle) => {
    const row = toMetaVehicleCatalogRow(vehicle, dealer);
    return META_VEHICLE_CATALOG_HEADERS.map((key) => csvEscape(row[key])).join(
      ",",
    );
  });
  return [header, ...rows].join("\n");
}
