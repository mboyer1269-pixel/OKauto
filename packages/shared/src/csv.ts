/**
 * Minimal, dependency-free CSV parser supporting quoted fields, escaped quotes,
 * and CRLF/LF line endings. Returns an array of record objects keyed by header.
 */
export function parseCsv(input: string): Array<Record<string, string>> {
  const rows = parseCsvRows(input);
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => h.trim());
  const records: Array<Record<string, string>> = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]!;
    if (row.length === 1 && row[0] === '') continue; // skip blank lines
    const record: Record<string, string> = {};
    for (let c = 0; c < header.length; c += 1) {
      record[header[c]!] = (row[c] ?? '').trim();
    }
    records.push(record);
  }
  return records;
}

export function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const len = input.length;

  while (i < len) {
    const char = input[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\r') {
      i += 1;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  // flush last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
