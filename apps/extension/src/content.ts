import { fillMarketplaceForm, isLikelyMarketplaceCreatePage, type FillPayload } from './adapters/marketplace.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OKAUTO_PING') {
    sendResponse({
      ok: true,
      marketplaceCreate: isLikelyMarketplaceCreatePage(),
      href: location.href,
    });
    return true;
  }

  if (message?.type === 'OKAUTO_FILL') {
    const payload = message.payload as FillPayload;
    if (!isLikelyMarketplaceCreatePage()) {
      sendResponse({
        ok: false,
        error:
          'Open Facebook Marketplace create/sell flow first. OKauto will not navigate or submit for you.',
      });
      return true;
    }
    const result = fillMarketplaceForm(payload);
    sendResponse({ ok: true, result });
    return true;
  }

  return false;
});
