import type { SyncAdapter, SyncVehicle } from '../types';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  auml: 'ä',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  euml: 'ë',
  icirc: 'î',
  iuml: 'ï',
  laquo: '«',
  lt: '<',
  nbsp: ' ',
  ocirc: 'ô',
  ouml: 'ö',
  quot: '"',
  raquo: '»',
  ugrave: 'ù',
  ucirc: 'û',
  uuml: 'ü',
};

function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function cleanText(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = decodeHtml(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  return cleaned || null;
}

function parseAttributes(tag?: string | null): Record<string, string> {
  if (!tag) return {};

  const attributes: Record<string, string> = {};
  const regex = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(tag)) !== null) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? '');
  }
  return attributes;
}

function findClassText(card: string, className: string): string | null {
  const regex = new RegExp(
    `<span[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`,
    'i'
  );
  return cleanText(regex.exec(card)?.[1]);
}

function extractSpecs(card: string): Map<string, string> {
  const specs = new Map<string, string>();
  const regex =
    /<div[^>]*class=["'][^"']*\bbox-lc\b[^"']*["'][^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/div>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(card)) !== null) {
    const label = cleanText(match[1])?.replace(/:$/, '').toLowerCase();
    const value = cleanText(match[2]);
    if (label && value) specs.set(label, value);
  }
  return specs;
}

function extractVehicleJsonLd(card: string): Record<string, unknown> | null {
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(card)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as Record<string, unknown>;
      if (String(parsed['@type'] ?? '').toLowerCase() === 'vehicle') return parsed;
    } catch {
      // Ignore malformed structured-data blocks and continue with the card.
    }
  }
  return null;
}

function extractCards(html: string): string[] {
  const starts = Array.from(
    html.matchAll(/<li\b[^>]*class=["'][^"']*\bcarBoxWrapper\b[^"']*["'][^>]*>/gi)
  );
  return starts.map((match, index) => {
    const start = match.index ?? 0;
    const end = starts[index + 1]?.index ?? html.length;
    return html.slice(start, end);
  });
}

function parseMileage(value?: string | null): number | null {
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

function parseNumber(value?: string | null): number | null {
  if (!value) return null;
  const number = Number.parseInt(value.replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(number) ? number : null;
}

function mapCondition(value: string | undefined, sourceUrl: string | undefined): string | null {
  const normalizedUrl = sourceUrl?.toLowerCase() ?? '';
  if (normalizedUrl.includes('/demonstrateurs/')) return 'Demo';
  if (normalizedUrl.includes('/occasion/')) return 'Used';
  if (normalizedUrl.includes('/neufs/')) return 'New';
  const normalized = value?.toLowerCase() ?? '';
  if (normalized.includes('new')) return 'New';
  if (normalized.includes('used')) return 'Used';
  return null;
}

function mapAvailability(value: unknown): SyncVehicle['status'] {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('outofstock') || normalized.includes('sold')) return 'SOLD';
  if (normalized.includes('preorder') || normalized.includes('pending')) return 'PENDING';
  return 'AVAILABLE';
}

function parseCard(card: string): SyncVehicle | null {
  const jsonLd = extractVehicleJsonLd(card);
  const inputTag = /<input[^>]*name=["']vehicledata["'][^>]*>/i.exec(card)?.[0];
  const imageTag = /<div[^>]*class=["'][^"']*\bcarImage\b[^"']*["'][^>]*>/i.exec(card)?.[0];
  const input = parseAttributes(inputTag);
  const image = parseAttributes(imageTag);

  const vin = String(
    jsonLd?.vehicleIdentificationNumber ?? input['data-vin'] ?? image['data-vin'] ?? ''
  ).trim();
  if (vin.length < 11) return null;

  const offers = jsonLd?.offers as Record<string, unknown> | undefined;
  const sourceUrl = typeof offers?.url === 'string' ? offers.url : undefined;
  const jsonImages = jsonLd?.image;
  const photos = Array.isArray(jsonImages)
    ? jsonImages.filter((url): url is string => typeof url === 'string' && url.startsWith('http'))
    : typeof jsonImages === 'string' && jsonImages.startsWith('http')
      ? [jsonImages]
      : undefined;
  const specs = extractSpecs(card);
  const summary = findClassText(card, 's-desc');
  const mileage = parseMileage(findClassText(card, 's-km'));
  const trim = findClassText(card, 'divTrim');
  const make =
    input['data-make'] ??
    image['data-make'] ??
    (typeof jsonLd?.brand === 'object' && jsonLd.brand
      ? String((jsonLd.brand as Record<string, unknown>).name ?? '')
      : undefined);
  const model = input['data-model'] ?? image['data-model'];
  const year = parseNumber(input['data-year'] ?? image['data-year']);
  const title = [year, make, model, trim].filter(Boolean).join(' ');

  return {
    vin,
    stockNumber:
      input['data-stock-number'] ?? image['data-nostock'] ?? (jsonLd?.sku != null ? String(jsonLd.sku) : null),
    year,
    make: make || null,
    model: model || null,
    trim,
    mileage,
    price: offers?.price != null ? Number(offers.price) : null,
    exteriorColor: specs.get('couleur extérieure') ?? null,
    interiorColor: specs.get('couleur intérieure') ?? null,
    description: [title, summary].filter(Boolean).join('. ') || cleanText(String(jsonLd?.description ?? '')),
    transmission: specs.get('transmission') ?? null,
    fuelType: specs.get('carburant') ?? null,
    drivetrain: specs.get('motricité') ?? null,
    engine: specs.get('moteur') ?? null,
    bodyStyle: specs.get('catégorie') ?? null,
    doors: parseNumber(specs.get('portes')),
    cylinders: parseNumber(specs.get('cylindres')),
    condition: mapCondition(input['data-condition'], sourceUrl),
    sourceUrl,
    status: mapAvailability(offers?.availability),
    photos,
  };
}

/**
 * Extract the full-size gallery for a D2C vehicle detail page.
 *
 * D2C renders the same photo in multiple sizes. The `cb...` path is the
 * full-size asset used by the lightbox; photos are ordered by their numeric
 * gallery position and capped to Facebook Marketplace's 20-photo limit.
 */
export function extractD2cDetailPhotos(html: string, sourceUrl: string): string[] {
  const carId = /-id(\d+)\.html(?:[?#]|$)/i.exec(sourceUrl)?.[1];
  if (!carId) return [];

  const photos = new Map<number, string>();
  const imageRegex =
    /https?:\\?\/\\?\/imagescdn\.d2cmedia\.ca\\?\/[^"'<>\s]+?\.(?:jpe?g|png|webp)(?:\?[^"'<>\s]*)?/gi;
  for (const match of html.matchAll(imageRegex)) {
    const normalized = decodeHtml(match[0].replace(/\\\//g, '/'));
    try {
      const url = new URL(normalized);
      if (url.protocol !== 'https:' || url.hostname !== 'imagescdn.d2cmedia.ca') continue;

      const segments = url.pathname.split('/').filter(Boolean);
      const idIndex = segments.indexOf(carId);
      if (idIndex < 1 || !/^cb/i.test(segments[0])) continue;

      const position = Number.parseInt(segments[idIndex + 1] ?? '', 10);
      if (!Number.isFinite(position) || position < 1) continue;
      photos.set(position, url.toString());
    } catch {
      // Ignore malformed image candidates and continue with the gallery.
    }
  }

  return [...photos.entries()]
    .sort(([left], [right]) => left - right)
    .slice(0, 20)
    .map(([, url]) => url);
}

/**
 * D2C Media search-results adapter.
 *
 * D2C inventory responses contain one `li.carBoxWrapper` per vehicle with
 * JSON-LD for stable identifiers/pricing plus HTML data attributes for stock,
 * trim, odometer, colours and specifications.
 */
export const d2cAdapter: SyncAdapter = {
  name: 'd2c',
  parse(body: string): SyncVehicle[] {
    const seen = new Set<string>();
    return extractCards(body)
      .map(parseCard)
      .filter((vehicle): vehicle is SyncVehicle => {
        if (!vehicle?.vin || seen.has(vehicle.vin)) return false;
        seen.add(vehicle.vin);
        return true;
      });
  },
};
