import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PENDING_PUBLICATION_TTL_MS,
  PUBLISH_CLICK_WINDOW_MS,
  findPublishedListingForVehicle,
  hasMatchingPublicationSessionIntent,
  publicationSessionIntent,
  isMarketplacePublishButtonLabel,
  isPendingPublicationArmed,
  markPendingPublicationClicked,
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
    expect(shouldBulkRelierOnTabUrl('https://www.facebook.com/marketplace/item/123')).toBe(true);
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


describe('automatic published listing association', () => {
  const vehicle = {
    id: 'vehicle-1',
    vin: '1HGCM82633A123456',
    stockNumber: 'A12345',
  };
  const published = (url = 'https://www.facebook.com/marketplace/item/424242/?ref=share') => ({
    externalUrl: url,
    title: '2024 Chevrolet Equinox · A12345',
    text: 'Annonce active',
  });
  const armed = (now = 100_000) =>
    markPendingPublicationClicked(createPendingPublication(vehicle, now - 2_000), now - 1_000);

  it('only arms after an explicit publish control; never publishes anything itself', () => {
    expect(isMarketplacePublishButtonLabel('Publier')).toBe(true);
    expect(isMarketplacePublishButtonLabel('Publish listing')).toBe(true);
    expect(isMarketplacePublishButtonLabel('Publier l’annonce')).toBe(true);
    expect(isMarketplacePublishButtonLabel('Suivant')).toBe(false);
    expect(isMarketplacePublishButtonLabel('Publish draft')).toBe(false);
    expect(isPendingPublicationArmed(createPendingPublication(vehicle, 1000), 2000)).toBe(false);
  });

  it('matches one seller listing by explicit stock, and canonicalizes URL', () => {
    expect(findPublishedListingForVehicle(armed(), [published()], 100_000)).toEqual({
      externalId: '424242',
      externalUrl: 'https://www.facebook.com/marketplace/item/424242/',
    });
  });

  it('matches an explicit VIN marker when no stock appears', () => {
    const candidate = { externalUrl: 'https://www.facebook.com/marketplace/item/44/',
      title: '2024 Chevrolet Equinox', text: 'NIV 1HGCM82633A123456' };
    expect(findPublishedListingForVehicle(armed(), [candidate], 100_000)?.externalId).toBe('44');
  });

  it('rejects title-only, unrelated stock, partial stock and mismatched VIN', () => {
    for (const candidate of [
      { ...published(), title: '2024 Chevrolet Equinox', text: '2024 Chevrolet Equinox' },
      { ...published(), title: '2024 Chevrolet Equinox · B12345' },
      { ...published(), title: '2024 Chevrolet Equinox · A123456' },
      { ...published(), text: 'NIV 1HGCM82633A123457' },
    ]) {
      expect(findPublishedListingForVehicle(armed(), [candidate], 100_000)).toBeNull();
    }
  });

  it('rejects unrelated domains or non-numeric listing IDs', () => {
    expect(findPublishedListingForVehicle(armed(), [published('https://facebook.com.evil.test/marketplace/item/424242/')], 100_000)).toBeNull();
    expect(findPublishedListingForVehicle(armed(), [published('https://www.facebook.com/marketplace/item/not-a-number/')], 100_000)).toBeNull();
  });

  it('never guesses between two distinct matching IDs', () => {
    const candidates = [published(), published('https://www.facebook.com/marketplace/item/8888/')];
    expect(findPublishedListingForVehicle(armed(), candidates, 100_000)).toBeNull();
  });

  it('deduplicates repeated links to the same Facebook listing', () => {
    expect(findPublishedListingForVehicle(armed(), [published(), published()], 100_000)?.externalId).toBe('424242');
  });

  it('rejects unarmed, expired and future clicks', () => {
    const original = createPendingPublication(vehicle, 1000);
    expect(findPublishedListingForVehicle(original, [published()], 2000)).toBeNull();
    const clicked = markPendingPublicationClicked(original, 2000);
    expect(isPendingPublicationArmed(clicked, 2000 + PUBLISH_CLICK_WINDOW_MS + 1)).toBe(false);
    expect(findPublishedListingForVehicle(clicked, [published()], 2000 + PUBLISH_CLICK_WINDOW_MS + 1)).toBeNull();
    expect(isPendingPublicationArmed(markPendingPublicationClicked(original, 10_000), 9000)).toBe(false);
  });
});


describe('tab-scoped publication intent', () => {
  const now = 100_000;
  const pending = markPendingPublicationClicked(
    createPendingPublication({ id: 'my-car' }, now - 2000),
    now - 1000,
  );

  it('accepts the same publish intent in the publishing tab only', () => {
    const intent = publicationSessionIntent(pending);
    expect(hasMatchingPublicationSessionIntent(pending, intent, now)).toBe(true);
    expect(hasMatchingPublicationSessionIntent(pending, null, now)).toBe(false);
  });

  it('rejects another vehicle, timestamp, invalid JSON and stale click', () => {
    const intent = publicationSessionIntent(pending)!;
    expect(hasMatchingPublicationSessionIntent({ ...pending, vehicle: { id: 'other-car' } }, intent, now)).toBe(false);
    expect(hasMatchingPublicationSessionIntent({ ...pending, startedAt: now - 1999 }, intent, now)).toBe(false);
    expect(hasMatchingPublicationSessionIntent(pending, '{broken', now)).toBe(false);
    expect(hasMatchingPublicationSessionIntent(pending, intent, now + PUBLISH_CLICK_WINDOW_MS + 1)).toBe(false);
  });

  it('does not create an intent before a human clicks Publish', () => {
    expect(publicationSessionIntent(createPendingPublication({ id: 'my-car' }, now))).toBeNull();
  });
});

describe("manual confirmation before association", () => {
  it("never sends LISTING_CONFIRMED directly from the seller-page watcher", () => {
    const content = readFileSync(
      resolve(__dirname, "../content/marketplace.ts"),
      "utf8",
    );
    const watcher = content.split("function watchForPublishedListing(")[1]?.split("async function prepareMarketplaceForm(")[0] ?? "";
    expect(watcher).toContain("promptPublishedListingConfirmation(current.vehicle, match.externalUrl)");
    expect(watcher).not.toContain("confirmPublishedListing(current.vehicle, match.externalUrl)");
  });

  it("requires an explicit confirmation button to submit the matched URL", () => {
    const content = readFileSync(
      resolve(__dirname, "../content/marketplace.ts"),
      "utf8",
    );
    const prompt = content.split("function promptPublishedListingConfirmation(")[1]?.split("function watchForPublishedListing(")[0] ?? "";
    expect(prompt).toContain('actionLabel: "Confirmer la liaison"');
    expect(prompt).toContain("onAction: () => {");
    expect(prompt).toContain("confirmPublishedListing(vehicle, canonicalUrl)");
    expect(prompt).not.toContain("chrome.runtime.sendMessage(");
  });
});
