import { describe, expect, it } from 'vitest';
import {
  PENDING_PUBLICATION_TTL_MS,
  createPendingPublication,
  isMarketplaceCreateUrl,
  isMarketplaceItemUrl,
  isPendingPublicationFresh,
} from '../publication-tracking';

describe('publication tracking', () => {
  it('recognizes Facebook create and published item URLs', () => {
    expect(isMarketplaceCreateUrl('https://www.facebook.com/marketplace/create/vehicle')).toBe(true);
    expect(isMarketplaceCreateUrl('https://www.facebook.com/marketplace/item/123')).toBe(false);
    expect(isMarketplaceItemUrl('https://www.facebook.com/marketplace/item/123')).toBe(true);
    expect(isMarketplaceItemUrl('https://m.facebook.com/marketplace/item/456/')).toBe(true);
    expect(isMarketplaceItemUrl('https://www.facebook.com/marketplace/create/vehicle')).toBe(false);
  });

  it('expires an abandoned pending publication', () => {
    const now = Date.now();
    const pending = createPendingPublication({ id: 'vehicle-1' }, now);

    expect(isPendingPublicationFresh(pending, now + PENDING_PUBLICATION_TTL_MS)).toBe(true);
    expect(isPendingPublicationFresh(pending, now + PENDING_PUBLICATION_TTL_MS + 1)).toBe(false);
  });
});
