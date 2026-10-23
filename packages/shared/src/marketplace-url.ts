export function extractFacebookMarketplaceItemId(
  value: string,
): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isFacebookHost =
      hostname === "facebook.com" || hostname.endsWith(".facebook.com");
    if (!isFacebookHost) return null;
    const match = url.pathname.match(/^\/marketplace\/item\/(\d+)\/?/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function facebookMarketplaceItemUrl(itemId: string): string {
  const id = itemId.trim();
  return `https://www.facebook.com/marketplace/item/${id}/`;
}

export function isFacebookMarketplaceItemUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      extractFacebookMarketplaceItemId(value) != null
    );
  } catch {
    return false;
  }
}

export function canonicalMarketplaceListingFields(
  externalUrl: string,
): { externalId: string; externalUrl: string } | null {
  const externalId = extractFacebookMarketplaceItemId(externalUrl);
  if (!externalId) return null;
  return {
    externalId,
    externalUrl: facebookMarketplaceItemUrl(externalId),
  };
}

export function listingExternalIdentityFromUrl(
  externalUrl: string | null,
): { externalId: string | null; externalUrl: string | null } {
  if (externalUrl == null) {
    return { externalId: null, externalUrl: null };
  }
  return (
    canonicalMarketplaceListingFields(externalUrl) ?? {
      externalId: null,
      externalUrl,
    }
  );
}

export function isSuiviaWebOrigin(origin?: string | null): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.origin === "https://suivia.ca") return true;
    if (url.origin === "http://localhost:3000") return true;
    return (
      url.protocol === "https:" &&
      /^[a-z0-9-]+\.suivia\.ca$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}
