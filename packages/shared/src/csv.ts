/**
 * Dependency-free CSV utilities (RFC 4180-ish) used for inventory imports.
 * Handles quoted fields, embedded commas/newlines, escaped quotes and BOM.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Strip UTF-8 BOM.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty trailing rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface CsvTable {
  headers: string[];
  records: Record<string, string>[];
}

export function parseCsvWithHeaders(text: string): CsvTable {
  const rows = parseCsv(text);
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0]!.map((h) => h.trim());
  const records = rows.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = (cells[i] ?? "").trim();
    });
    return rec;
  });
  return { headers, records };
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell === null || cell === undefined ? "" : String(cell);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

/**
 * Case/punctuation-insensitive header lookup, so feeds with headers like
 * "Stock #", "stock_number" or "StockNumber" all map to the same field.
 */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function buildHeaderIndex(headers: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const h of headers) {
    const key = normalizeHeader(h);
    if (!index.has(key)) index.set(key, h);
  }
  return index;
}

/** Returns the raw value for the first alias present in the record. */
export function pickField(
  record: Record<string, string>,
  headerIndex: Map<string, string>,
  aliases: string[],
): string | undefined {
  for (const alias of aliases) {
    const original = headerIndex.get(normalizeHeader(alias));
    if (original !== undefined) {
      const value = record[original];
      if (value !== undefined && value !== "") return value;
    }
  }
  return undefined;
}
