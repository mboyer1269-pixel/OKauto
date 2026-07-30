import { MARKETPLACE_CREATE_URL } from "@okauto/shared";
import { OkAutoApiClient, type QueueListing } from "../lib/api-client.js";
import { getSettings } from "../lib/storage.js";

const QUEUE_ALARM = "okauto-queue-refresh";

async function apiClient(): Promise<OkAutoApiClient> {
  const { apiUrl, pat } = await getSettings();
  if (!pat) throw new Error("Not paired. Open the extension options and paste a pairing token.");
  return new OkAutoApiClient(apiUrl, pat);
}

async function updateBadge(): Promise<void> {
  try {
    const api = await apiClient();
    const queue = await api.myQueue();
    const count = queue.items.length;
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#0d9488" });
  } catch {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#b91c1c" });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(QUEUE_ALARM, { periodInMinutes: 5 });
  void updateBadge();
});
chrome.runtime.onStartup.addListener(() => void updateBadge());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === QUEUE_ALARM) void updateBadge();
});

function listingToPayload(listing: QueueListing) {
  const vehicle = listing.vehicle;
  return {
    listingId: listing.id,
    title: listing.title,
    description: listing.description ?? vehicle.description ?? "",
    priceCents: listing.priceCents ?? vehicle.priceCents,
    vehicle: {
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      mileage: vehicle.mileage,
      bodyStyle: vehicle.bodyStyle,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      condition: vehicle.condition,
    },
    photoUrls: [...vehicle.photos].sort((a, b) => a.position - b.position).map((p) => p.url),
  };
}

async function openAssistTab(payload: unknown): Promise<void> {
  const tab = await chrome.tabs.create({ url: MARKETPLACE_CREATE_URL, active: true });
  if (!tab.id) throw new Error("Could not open Marketplace tab");
  const tabId = tab.id;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Marketplace page load timed out"));
    }, 45000);
    const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        // Give the SPA a beat to hydrate before sending the payload.
        setTimeout(resolve, 2500);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
  await chrome.tabs.sendMessage(tabId, { type: "ASSIST_BEGIN", payload });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    try {
      switch (message?.type as string) {
        case "GET_STATUS": {
          const api = await apiClient();
          const ping = await api.ping();
          sendResponse({ ok: true, ping });
          return;
        }
        case "GET_QUEUE": {
          const api = await apiClient();
          const queue = await api.myQueue();
          sendResponse({ ok: true, items: queue.items });
          return;
        }
        case "START_ASSIST": {
          const api = await apiClient();
          const listingId = message.listingId as string;
          const queue = await api.myQueue();
          const listing = queue.items.find((l) => l.id === listingId);
          if (!listing) {
            sendResponse({ ok: false, error: "Listing is no longer in your queue" });
            return;
          }
          try {
            await api.transition(listingId, { to: "IN_PROGRESS", note: "Assist started from extension" });
          } catch {
            // Idempotent: already in progress (e.g. retry after abort).
          }
          await openAssistTab(listingToPayload(listing));
          sendResponse({ ok: true });
          return;
        }
        case "ASSIST_DONE": {
          const api = await apiClient();
          const outcome = message.outcome as
            | { kind: "LIVE"; externalUrl: string }
            | { kind: "ATTENTION"; reason: string };
          if (outcome.kind === "LIVE") {
            await api.transition(message.listingId as string, {
              to: "LIVE",
              externalUrl: outcome.externalUrl,
              note: "Published by user via assisted flow",
            });
          } else {
            await api.transition(message.listingId as string, {
              to: "ATTENTION",
              failureReason: outcome.reason,
            });
          }
          await updateBadge();
          sendResponse({ ok: true });
          return;
        }
        case "START_REMOVAL": {
          const api = await apiClient();
          await chrome.tabs.create({ url: "https://www.facebook.com/marketplace/you/selling", active: true });
          sendResponse({ ok: true });
          void api;
          return;
        }
        case "REMOVAL_DONE": {
          if (message.ok) {
            const api = await apiClient();
            await api.transition(message.listingId as string, { to: "REMOVED", note: "Removed via extension assist" });
          }
          sendResponse({ ok: true });
          return;
        }
        case "FETCH_PHOTO": {
          const url = message.url as string;
          const res = await fetch(url, { credentials: "omit", redirect: "follow" });
          if (!res.ok) {
            sendResponse({ ok: false, error: `photo fetch ${res.status}` });
            return;
          }
          const contentType = res.headers.get("content-type") ?? "image/jpeg";
          const buffer = await res.arrayBuffer();
          let binary = "";
          const bytes = new Uint8Array(buffer);
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          sendResponse({ ok: true, blobBase64: btoa(binary), contentType });
          return;
        }
        case "BADGE_REFRESH": {
          await updateBadge();
          sendResponse({ ok: true });
          return;
        }
        default:
          sendResponse({ ok: false, error: "unknown message" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : "unknown error" });
    }
  })();
  return true; // async response
});
