import { isValidVinFormat, normalizeVin } from "./vin";

export type MatchableVehicle = {
  id: string;
  vin?: string | null;
  stockNumber?: string | null;
};

export type ListingMatchHint = {
  vehicleId?: string | null;
  title?: string | null;
  text?: string | null;
};

export type ListingMatchReason = "vehicleId" | "vin" | "stock";

export type ListingMatchResult<T extends MatchableVehicle> = {
  vehicle: T;
  reason: ListingMatchReason;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function listingMatchHaystack(hint: ListingMatchHint): string {
  return [hint.title, hint.text].filter(Boolean).join("\n");
}

export function extractVinsFromText(text: string): string[] {
  const matches = text.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) ?? [];
  return [...new Set(matches.filter((candidate) => isValidVinFormat(candidate)))];
}

export function extractStockHintsFromText(text: string): string[] {
  const hints = new Set<string>();
  const patterns = [
    /\bstock\s*[:#·•-]?\s*([A-Z0-9][A-Z0-9-]{1,19})\b/gi,
    /\bno(?:um[eé]ro)?\s*de\s*stock\s*[:#·•-]?\s*([A-Z0-9][A-Z0-9-]{1,19})\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const stock = match[1]?.trim().toUpperCase();
      if (stock) hints.add(stock);
    }
  }
  return [...hints];
}

export function listingsFromAnchors(
  anchors: Array<{ href: string; title?: string; text?: string }>,
): Array<{
  externalId: string;
  externalUrl: string;
  title: string;
  text: string;
}> {
  const seen = new Set<string>();
  const listings: Array<{
    externalId: string;
    externalUrl: string;
    title: string;
    text: string;
  }> = [];

  for (const anchor of anchors) {
    let itemId: string | null = null;
    try {
      const url = new URL(anchor.href, "https://www.facebook.com");
      const hostname = url.hostname.toLowerCase();
      const isFacebookHost =
        hostname === "facebook.com" || hostname.endsWith(".facebook.com");
      if (!isFacebookHost) continue;
      const match = url.pathname.match(/^\/marketplace\/item\/([^/]+)/i);
      itemId = match?.[1] ? decodeURIComponent(match[1]).trim() : null;
    } catch {
      continue;
    }
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    listings.push({
      externalId: itemId,
      externalUrl: `https://www.facebook.com/marketplace/item/${itemId}`,
      title: (anchor.title ?? "").replace(/\s+/g, " ").trim(),
      text: (anchor.text ?? "").replace(/\s+/g, " ").trim().slice(0, 4000),
    });
  }

  return listings;
}

export function matchListingToVehicle<T extends MatchableVehicle>(
  vehicles: T[],
  hint: ListingMatchHint,
): ListingMatchResult<T> | null {
  if (hint.vehicleId) {
    const vehicle = vehicles.find((candidate) => candidate.id === hint.vehicleId);
    if (vehicle) return { vehicle, reason: "vehicleId" };
  }

  const haystack = listingMatchHaystack(hint);
  const vins = extractVinsFromText(haystack);
  const vinHits = vehicles.filter((candidate) => {
    if (!candidate.vin) return false;
    return vins.includes(normalizeVin(candidate.vin));
  });
  if (vinHits.length === 1) return { vehicle: vinHits[0], reason: "vin" };
  if (vinHits.length > 1) return null;

  const hintedStocks = new Set(extractStockHintsFromText(haystack));
  const stockHits = vehicles.filter((candidate) => {
    const stock = candidate.stockNumber?.trim();
    if (!stock || stock.length < 3) return false;
    const normalized = stock.toUpperCase();
    if (hintedStocks.has(normalized)) return true;
    const pattern = new RegExp(`\\b${escapeRegExp(stock)}\\b`, "i");
    return pattern.test(haystack);
  });
  if (stockHits.length === 1) return { vehicle: stockHits[0], reason: "stock" };
  return null;
}
