import { apiFetch, getSession } from "./api.js";
import type { ExtMessage, MessageResponse, PendingListing } from "./types.js";

/**
 * Background service worker:
 * - routes "start listing" requests: stores the pending draft and opens the
 *   Marketplace create-vehicle page in a new tab;
 * - relays listing lifecycle events from the content script to the API;
 * - polls unread notifications to keep the action badge fresh.
 *
 * Compliance: the extension never submits the Marketplace form, never
 * bypasses CAPTCHAs/anti-bot measures, and acts only on explicit user action.
 */

const MARKETPLACE_CREATE_URL = "https://www.facebook.com/marketplace/create/vehicle";
const PENDING_PREFIX = "openlot.pending.";

async function setPending(tabId: number, pending: PendingListing): Promise<void> {
  await chrome.storage.session.set({ [`${PENDING_PREFIX}${tabId}`]: pending });
}

async function getPending(tabId: number): Promise<PendingListing | null> {
  const data = await chrome.storage.session.get(`${PENDING_PREFIX}${tabId}`);
  return (data[`${PENDING_PREFIX}${tabId}`] as PendingListing | undefined) ?? null;
}

async function clearPending(tabId: number): Promise<void> {
  await chrome.storage.session.remove(`${PENDING_PREFIX}${tabId}`);
}

async function updateBadge(): Promise<void> {
  try {
    const session = await getSession();
    if (!session) {
      await chrome.action.setBadgeText({ text: "" });
      return;
    }
    const { count } = await apiFetch<{ count: number }>("/api/v1/notifications/unread-count");
    await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
    await chrome.action.setBadgeText({ text: count > 0 ? String(Math.min(count, 99)) : "" });
  } catch {
    // Offline or signed out — leave the badge as is.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("openlot-badge", { periodInMinutes: 1 });
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  void updateBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "openlot-badge") void updateBadge();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearPending(tabId);
});

chrome.runtime.onMessage.addListener((message: ExtMessage, sender, sendResponse: (r: MessageResponse) => void) => {
  (async () => {
    switch (message.kind) {
      case "START_LISTING": {
        const tab = await chrome.tabs.create({ url: MARKETPLACE_CREATE_URL, active: true });
        if (tab.id !== undefined) {
          await setPending(tab.id, { ...message.pending, createdAt: Date.now() });
        }
        sendResponse({ ok: true });
        return;
      }
      case "GET_PENDING": {
        const tabId = sender.tab?.id;
        sendResponse({ ok: true, pending: tabId !== undefined ? await getPending(tabId) : null });
        return;
      }
      case "LISTING_EVENT": {
        const tabId = sender.tab?.id;
        const pending = tabId !== undefined ? await getPending(tabId) : null;
        if (!pending) {
          sendResponse({ ok: false, error: "No pending listing for this tab" });
          return;
        }
        await apiFetch(`/api/v1/orgs/${pending.orgId}/listings/${pending.listingId}/events`, {
          method: "POST",
          body: { type: message.type, message: message.message, remoteUrl: message.remoteUrl },
        });
        if (message.type === "PUBLISHED" || message.type === "FAILED") {
          if (tabId !== undefined) await clearPending(tabId);
        }
        sendResponse({ ok: true });
        return;
      }
      case "CLEAR_PENDING": {
        const tabId = sender.tab?.id;
        if (tabId !== undefined) await clearPending(tabId);
        sendResponse({ ok: true });
        return;
      }
      case "REFRESH_BADGE": {
        await updateBadge();
        sendResponse({ ok: true });
        return;
      }
      default:
        sendResponse({ ok: false, error: "Unknown message" });
    }
  })().catch((err) => {
    sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
  });
  return true; // keep the message channel open for the async response
});
