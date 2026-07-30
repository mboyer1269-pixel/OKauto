/**
 * Minimal, correct CSV parser (RFC 4180: quoted fields, escaped quotes, CRLF)
 * plus header-aliased mapping to feed items. No third-party dependency.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_ALIASES: Record<string, string> = {
  vin: "vin",
  stock: "stockNumber",
  stocknumber: "stockNumber",
  stock_number: "stockNumber",
  stockno: "stockNumber",
  year: "year",
  make: "make",
  model: "model",
  trim: "trim",
  price: "price",
  pricecents: "priceCents",
  msrp: "price",
  mileage: "mileage",
  miles: "mileage",
  odometer: "mileage",
  bodystyle: "bodyStyle",
  body_style: "bodyStyle",
  body: "bodyStyle",
  fuel: "fuelType",
  fueltype: "fuelType",
  fuel_type: "fuelType",
  transmission: "transmission",
  trans: "transmission",
  drivetrain: "drivetrain",
  drive: "drivetrain",
  condition: "condition",
  exteriorcolor: "exteriorColor",
  exterior_color: "exteriorColor",
  color: "exteriorColor",
  interiorcolor: "interiorColor",
  interior_color: "interiorColor",
  description: "description",
  photos: "photos",
  photourls: "photoUrls",
  photo_urls: "photoUrls",
  images: "photos",
  currency: "currency",
  externalid: "externalId",
  external_id: "externalId",
};

export interface CsvParseResult {
  items: Record<string, unknown>[];
  headerErrors: string[];
}

export function csvToFeedItems(text: string): CsvParseResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { items: [], headerErrors: ["CSV is empty"] };

  const headers = rows[0]!.map((h) => h.trim());
  const mapping: (string | null)[] = headers.map((h) => HEADER_ALIASES[h.toLowerCase().replace(/\s+/g, "")] ?? null);
  const headerErrors: string[] = [];
  if (!mapping.includes("make") || !mapping.includes("model")) {
    headerErrors.push("CSV must include at least make and model columns");
  }
  if (!mapping.includes("price") && !mapping.includes("priceCents")) {
    headerErrors.push("CSV must include a price column");
  }

  const items: Record<string, unknown>[] = [];
  for (const row of rows.slice(1)) {
    const item: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c += 1) {
      const key = mapping[c];
      if (!key) continue;
      const value = (row[c] ?? "").trim();
      if (value === "") continue;
      if (key === "photos" || key === "photoUrls") {
        item.photoUrls = value
          .split(/[|;]/)
          .map((u) => u.trim())
          .filter((u) => /^https?:\/\//.test(u));
        continue;
      }
      if (key === "price") {
        item.price = Number(value.replace(/[$,]/g, ""));
        continue;
      }
      if (key === "mileage" || key === "year" || key === "priceCents") {
        item[key] = value.replace(/[,\s]/g, "");
        continue;
      }
      item[key] = value;
    }
    items.push(item);
  }
  return { items, headerErrors };
}
