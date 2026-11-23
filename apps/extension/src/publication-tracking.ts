import { extractFacebookMarketplaceItemId, facebookMarketplaceItemUrl } from "@okauto/shared";


/** A click is an intent, not proof that Facebook accepted the listing. */
export const PUBLISH_CLICK_WINDOW_MS = 10 * 60 * 1000;

export function isMarketplacePublishButtonLabel(value: string): boolean {
  return /^(?:publier|publish)(?:\s+(?:l[’']annonce|cette annonce|une annonce|listing|your listing|now|maintenant))?$/i.test(
    value.trim().replace(/\s+/g, " "),
  );
}

export function markPendingPublicationClicked<T>(
  pending: PendingPublication<T>,
  now = Date.now(),
): PendingPublication<T> {
  return { ...pending, publishClickedAt: now };
}


export const PUBLICATION_SESSION_INTENT_KEY = 'suivia-marketplace-publish-intent-v1';

export function publicationSessionIntent<T extends { id: string }>(
  pending: PendingPublication<T>,
): string | null {
  if (pending.publishClickedAt == null) return null;
  return JSON.stringify({
    vehicleId: pending.vehicle.id,
    startedAt: pending.startedAt,
    publishClickedAt: pending.publishClickedAt,
  });
}

/** A different Facebook tab must never claim this pending publication. */
export function hasMatchingPublicationSessionIntent<T extends { id: string }>(
  pending: PendingPublication<T>,
  rawIntent: string | null,
  now = Date.now(),
): boolean {
  if (!rawIntent || !isPendingPublicationArmed(pending, now)) return false;
  try {
    const saved = JSON.parse(rawIntent) as Record<string, unknown>;
    return saved.vehicleId === pending.vehicle.id &&
      saved.startedAt === pending.startedAt &&
      saved.publishClickedAt === pending.publishClickedAt;
  } catch {
    return false;
  }
}


/**
 * Restore a human Publish click if Chrome navigated before the asynchronous
 * chrome.storage.local.set callback completed. The tab-scoped session record
 * must exactly match the pending vehicle and its startedAt.
 */
export function recoverPendingPublicationClick<T extends { id: string }>(
  pending: PendingPublication<T>,
  rawIntent: string | null,
  now = Date.now(),
): PendingPublication<T> {
  if (pending.publishClickedAt != null || !rawIntent || !isPendingPublicationFresh(pending, now)) {
    return pending;
  }
  try {
    const saved = JSON.parse(rawIntent) as Record<string, unknown>;
    if (saved.vehicleId !== pending.vehicle.id ||
        saved.startedAt !== pending.startedAt ||
        typeof saved.publishClickedAt !== "number") {
      return pending;
    }
    const recovered = { ...pending, publishClickedAt: saved.publishClickedAt };
    return isPendingPublicationArmed(recovered, now) ? recovered : pending;
  } catch {
    return pending;
  }
}

export function isPendingPublicationArmed(
  pending: PendingPublication<unknown> | null | undefined,
  now = Date.now(),
): boolean {
  return Boolean(
    isPendingPublicationFresh(pending, now) &&
      pending?.publishClickedAt != null &&
      Number.isFinite(pending.publishClickedAt) &&
      pending.publishClickedAt >= pending.startedAt &&
      pending.publishClickedAt <= now &&
      now - pending.publishClickedAt <= PUBLISH_CLICK_WINDOW_MS,
  );
}

type PublicationVehicleIdentity = {
  id: string;
  stockNumber?: string | null;
  vin?: string | null;
};

type MarketplaceListingCandidate = {
  externalUrl: string;
  title?: string | null;
  text?: string | null;
};

function containsIdentityMarker(text: string, vehicle: PublicationVehicleIdentity): boolean {
  const vin = vehicle.vin?.trim().toUpperCase();
  const stock = vehicle.stockNumber?.trim().toUpperCase();
  if (!vin && (!stock || stock.length < 3)) return false;

  const advertisedVins = [...text.matchAll(/\b(?:VIN|NIV)\s*[:#-]?\s*([A-HJ-NPR-Z0-9]{17})\b/gi)]
    .map((match) => match[1].toUpperCase());
  if (vin && advertisedVins.length > 0 && advertisedVins.some((found) => found !== vin)) {
    return false;
  }

  const advertisedStocks = [...text.matchAll(
    /(?:\bstock\s*[:#·•-]?\s*|[·•]\s*)([A-Z0-9][A-Z0-9-]{2,19})(?![A-Z0-9-])/gi,
  )].map((match) => match[1].toUpperCase());
  if (stock && advertisedStocks.length > 0 && advertisedStocks.some((found) => found !== stock)) {
    return false;
  }

  const vinMatches = Boolean(
    vin && vin.length === 17 &&
      new RegExp('(?:^|[^A-Z0-9])' + vin + '(?![A-Z0-9])', 'i').test(text),
  );
  const stockMatches = Boolean(
    stock && stock.length >= 3 && advertisedStocks.includes(stock),
  );
  return vinMatches || stockMatches;
}

/**
 * A successful association needs all of: a recent human Publish click,
 * a canonical numeric Facebook item ID, and exactly one listing displaying
 * this vehicle's explicit stock/VIN marker. Approximate title matches are unsafe.
 * Feed only links from the seller's own listings or the current item page.
 */
export function findPublishedListingForVehicle<T extends PublicationVehicleIdentity>(
  pending: PendingPublication<T>,
  candidates: readonly MarketplaceListingCandidate[],
  now = Date.now(),
): { externalId: string; externalUrl: string } | null {
  if (!isPendingPublicationArmed(pending, now)) return null;
  const matches = new Map<string, string>();
  for (const candidate of candidates) {
    const id = extractFacebookMarketplaceItemId(candidate.externalUrl);
    if (!id) continue;
    if (!containsIdentityMarker(
      [candidate.title, candidate.text].filter(Boolean).join(' '),
      pending.vehicle,
    )) continue;
    matches.set(id, facebookMarketplaceItemUrl(id));
    if (matches.size > 1) return null;
  }
  if (matches.size !== 1) return null;
  const [externalId, externalUrl] = [...matches][0];
  return { externalId, externalUrl };
}


/** Fail closed if a banner is stale or Facebook now shows conflicting matches. */
export function canConfirmPublicationCandidate<T extends PublicationVehicleIdentity>(
  pending: PendingPublication<T>,
  rawIntent: string | null,
  candidateUrl: string,
  listings: readonly MarketplaceListingCandidate[],
  now = Date.now(),
): boolean {
  if (!hasMatchingPublicationSessionIntent(pending, rawIntent, now)) return false;
  const proposedId = extractFacebookMarketplaceItemId(candidateUrl);
  const matched = findPublishedListingForVehicle(pending, listings, now);
  return Boolean(proposedId && matched && matched.externalId === proposedId);
}

export const PENDING_PUBLICATION_KEY = 'pendingPublication';
export const PENDING_RELIER_KEY = 'pendingRelier';
export const PENDING_PUBLICATION_TTL_MS = 6 * 60 * 60 * 1000;
export const MARKETPLACE_SELLING_URL =
  'https://www.facebook.com/marketplace/you/selling';

export interface PendingPublication<T> {
  vehicle: T;
  startedAt: number;
  /** Recorded only after the user presses Facebook's Publish control. */
  publishClickedAt?: number;
}

export function createPendingPublication<T>(vehicle: T, now = Date.now()): PendingPublication<T> {
  return { vehicle, startedAt: now };
}

export function isPendingPublicationFresh(
  pending: PendingPublication<unknown> | null | undefined,
  now = Date.now()
): boolean {
  return Boolean(
    pending &&
      Number.isFinite(pending.startedAt) &&
      pending.startedAt <= now &&
      now - pending.startedAt <= PENDING_PUBLICATION_TTL_MS
  );
}

export function isMarketplaceCreateUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(^|\.)facebook\.com$/i.test(url.hostname) &&
      url.pathname.startsWith('/marketplace/create');
  } catch {
    return false;
  }
}

export function isMarketplaceItemUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(^|\.)facebook\.com$/i.test(url.hostname) &&
      /^\/marketplace\/item\/[^/]+/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function isMarketplaceSellingUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      /(^|\.)facebook\.com$/i.test(url.hostname) &&
      (/\/marketplace\/you\/selling/i.test(url.pathname) ||
        /\/marketplace\/you\/?$/i.test(url.pathname))
    );
  } catch {
    return false;
  }
}

export function isFacebookMarketplaceHost(value: string): boolean {
  try {
    const url = new URL(value);
    return /(^|\.)facebook\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function shouldBulkRelierOnTabUrl(url?: string | null): boolean {
  return Boolean(url && (isMarketplaceSellingUrl(url) || isMarketplaceItemUrl(url)));
}

export type MarketplaceSessionState = "logged_in" | "logged_out" | "unknown";

export function detectMarketplaceSession(doc: {
  querySelector: Document["querySelector"];
  querySelectorAll: Document["querySelectorAll"];
  body?: { innerText?: string } | null;
}): MarketplaceSessionState {
  const loginField = doc.querySelector(
    'form[action*="login"], input[name="email"], input[name="pass"], input[type="password"]',
  );
  const loginCta = Array.from(
    doc.querySelectorAll("a, button, [role='button']"),
  ).some((element) => {
    const text = `${element.getAttribute("aria-label") ?? ""} ${element.textContent ?? ""}`
      .toLocaleLowerCase("fr-CA");
    return /se connecter|log in|log into facebook|connexion à facebook/.test(
      text,
    );
  });
  const hasItemLinks = Boolean(
    doc.querySelector('a[href*="/marketplace/item/"]'),
  );
  const bodyText = (doc.body?.innerText ?? "").replace(/\s+/g, " ").trim();
  const looksLikeSelling =
    hasItemLinks ||
    /vos annonces|your listings|selling/.test(bodyText.toLocaleLowerCase("fr-CA"));

  if (loginField && !looksLikeSelling) return "logged_out";
  if (loginCta && !looksLikeSelling && bodyText.length < 1200) return "logged_out";
  if (bodyText.length < 80 && !hasItemLinks) return "logged_out";
  if (looksLikeSelling) return "logged_in";
  return "unknown";
}

export type RelierMessageOutcome =
  | "delivered"
  | "missing_content_script"
  | "app_error";

export function classifyRelierMessageResult(input: {
  runtimeError?: string | null;
  response?: { success?: boolean; error?: string } | null;
}): RelierMessageOutcome {
  if (input.runtimeError) return "missing_content_script";
  if (input.response?.success === false && input.response.error) {
    return "app_error";
  }
  return "delivered";
}
