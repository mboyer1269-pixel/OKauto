export const PENDING_PUBLICATION_KEY = 'pendingPublication';
export const PENDING_RELIER_KEY = 'pendingRelier';
export const PENDING_PUBLICATION_TTL_MS = 6 * 60 * 60 * 1000;
export const MARKETPLACE_SELLING_URL =
  'https://www.facebook.com/marketplace/you/selling';

export interface PendingPublication<T> {
  vehicle: T;
  startedAt: number;
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
