import { describe, expect, it } from 'vitest';
import {
  PENDING_PUBLICATION_TTL_MS,
  classifyRelierMessageResult,
  createPendingPublication,
  isFacebookMarketplaceHost,
  isMarketplaceCreateUrl,
  isMarketplaceItemUrl,
  isMarketplaceSellingUrl,
  isPendingPublicationFresh,
  shouldBulkRelierOnTabUrl,
} from '../publication-tracking';

describe('publication tracking', () => {
  it('recognizes Facebook create and published item URLs', () => {
    expect(isMarketplaceCreateUrl('https://www.facebook.com/marketplace/create/vehicle')).toBe(true);
    expect(isMarketplaceCreateUrl('https://www.facebook.com/marketplace/item/123')).toBe(false);
    expect(isMarketplaceItemUrl('https://www.facebook.com/marketplace/item/123')).toBe(true);
    expect(isMarketplaceItemUrl('https://m.facebook.com/marketplace/item/456/')).toBe(true);
    expect(isMarketplaceItemUrl('https://www.facebook.com/marketplace/create/vehicle')).toBe(false);
    expect(isMarketplaceSellingUrl('https://www.facebook.com/marketplace/you/selling')).toBe(true);
    expect(isMarketplaceSellingUrl('https://www.facebook.com/marketplace/you')).toBe(true);
    expect(isFacebookMarketplaceHost('https://www.facebook.com/marketplace/you/selling')).toBe(true);
    expect(shouldBulkRelierOnTabUrl('https://www.facebook.com/marketplace/you/selling')).toBe(true);
    expect(shouldBulkRelierOnTabUrl('https://www.facebook.com/marketplace/you')).toBe(true);
    expect(shouldBulkRelierOnTabUrl('https://www.facebook.com/marketplace')).toBe(false);
    expect(shouldBulkRelierOnTabUrl('https://www.facebook.com/marketplace/item/123')).toBe(false);
    expect(shouldBulkRelierOnTabUrl('https://www.facebook.com/marketplace/search/?query=honda')).toBe(false);
  });

  it('keeps the popup open until Relier delivery or fallback is decided', () => {
    expect(
      classifyRelierMessageResult({
        runtimeError: 'Could not establish connection. Receiving end does not exist.',
      }),
    ).toBe('missing_content_script');
    expect(
      classifyRelierMessageResult({
        response: { success: false, error: 'Aucune annonce trouvée.' },
      }),
    ).toBe('app_error');
    expect(classifyRelierMessageResult({ response: { success: true } })).toBe(
      'delivered',
    );
  });

  it('expires an abandoned pending publication', () => {
    const now = Date.now();
    const pending = createPendingPublication({ id: 'vehicle-1' }, now);

    expect(isPendingPublicationFresh(pending, now + PENDING_PUBLICATION_TTL_MS)).toBe(true);
    expect(isPendingPublicationFresh(pending, now + PENDING_PUBLICATION_TTL_MS + 1)).toBe(false);
  });
});
