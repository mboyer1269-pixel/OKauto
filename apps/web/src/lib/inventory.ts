import { createHash } from "node:crypto";
import {
  csvVehicleRowSchema,
  dollarsToCents,
  type VehicleCategory,
  type VehicleStatus,
} from "@okauto/shared";

export type ParsedVehicleRow = {
  vin?: string;
  stockNumber: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  priceCents: number;
  mileage?: number;
  bodyStyle?: string;
  exteriorColor?: string;
  interiorColor?: string;
  drivetrain?: string;
  transmission?: string;
  fuelType?: string;
  description?: string;
  status?: VehicleStatus;
  category?: VehicleCategory;
  photoUrls: string[];
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      if (row.some((c) => c.length)) rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c.length)) rows.push(row);
  return rows;
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const HEADER_MAP: Record<string, string> = {
  vin: "vin",
  stock: "stockNumber",
  stocknumber: "stockNumber",
  stockno: "stockNumber",
  year: "year",
  make: "make",
  model: "model",
  trim: "trim",
  price: "price",
  askingprice: "price",
  mileage: "mileage",
  odometer: "mileage",
  bodystyle: "bodyStyle",
  body: "bodyStyle",
  exteriorcolor: "exteriorColor",
  color: "exteriorColor",
  interiorcolor: "interiorColor",
  drivetrain: "drivetrain",
  transmission: "transmission",
  fuel: "fuelType",
  fueltype: "fuelType",
  description: "description",
  status: "status",
  category: "category",
  photos: "photos",
  photo: "photos",
  imageurls: "photos",
};

export function parseInventoryCsv(csvText: string): {
  rows: ParsedVehicleRow[];
  errors: Array<{ line: number; message: string }>;
} {
  const table = parseCsv(csvText);
  if (table.length < 2) {
    return { rows: [], errors: [{ line: 1, message: "CSV must include header and data rows" }] };
  }

  const headers = table[0]!.map((h) => HEADER_MAP[normalizeHeader(h)]).filter(Boolean);
  if (!headers.includes("stockNumber") || !headers.includes("year") || !headers.includes("make") || !headers.includes("model") || !headers.includes("price")) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message: "Required columns: stockNumber, year, make, model, price",
        },
      ],
    };
  }

  const rows: ParsedVehicleRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (let i = 1; i < table.length; i++) {
    const raw = table[i]!;
    const obj: Record<string, string> = {};
    table[0]!.forEach((header, idx) => {
      const key = HEADER_MAP[normalizeHeader(header)];
      if (key) obj[key] = raw[idx] ?? "";
    });

    const parsed = csvVehicleRowSchema.safeParse(obj);
    if (!parsed.success) {
      errors.push({
        line: i + 1,
        message: parsed.error.issues.map((x) => x.message).join("; "),
      });
      continue;
    }

    const data = parsed.data;
    rows.push({
      vin: data.vin || undefined,
      stockNumber: data.stockNumber,
      year: data.year,
      make: data.make,
      model: data.model,
      trim: data.trim,
      priceCents: dollarsToCents(data.price),
      mileage: data.mileage,
      bodyStyle: data.bodyStyle,
      exteriorColor: data.exteriorColor,
      interiorColor: data.interiorColor,
      drivetrain: data.drivetrain,
      transmission: data.transmission,
      fuelType: data.fuelType,
      description: data.description,
      status: data.status,
      category: data.category,
      photoUrls: (data.photos ?? "")
        .split(/[|;]/)
        .map((u) => u.trim())
        .filter((u) => /^https?:\/\//i.test(u)),
    });
  }

  return { rows, errors };
}

export function vehicleContentHash(input: {
  stockNumber: string;
  priceCents: number;
  status: string;
  mileage?: number | null;
}): string {
  return createHash("sha256")
    .update(
      [input.stockNumber, String(input.priceCents), input.status, String(input.mileage ?? "")].join(
        "|",
      ),
    )
    .digest("hex");
}
