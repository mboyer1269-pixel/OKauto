/** Background service worker: relays backend status updates for the content script. */
import { setListingStatus } from './lib/api.js';
import type { BgMessage, BgResponse } from './lib/messages.js';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[OKauto] extension installed');
});

chrome.runtime.onMessage.addListener((message: BgMessage, _sender, sendResponse: (r: BgResponse) => void) => {
  if (message.type === 'PING') {
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === 'SET_STATUS') {
    setListingStatus(message.listingId, message.status, message.externalUrl)
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true; // async response
  }
  return false;
});
