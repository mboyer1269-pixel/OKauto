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
