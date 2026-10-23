import {
  chunkItems,
  emptyLinkListingCounts,
  isSuiviaWebOrigin,
  LINK_LISTINGS_MAX_BATCH,
  mergeLinkListingCounts,
  userFacingApiError,
} from "@okauto/shared";
import {
  MARKETPLACE_SELLING_URL,
  PENDING_RELIER_KEY,
  shouldBulkRelierOnTabUrl,
} from "../publication-tracking";

const PENDING_PUBLICATION_KEY = "pendingPublication";
const DEFAULT_API_URL = "https://suivia.ca";

function isMarketplaceItemUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      /(^|\.)facebook\.com$/i.test(url.hostname) &&
      /^\/marketplace\/item\/\d+/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function clearLocalApiKey() {
  return new Promise<void>((resolve) => {
    chrome.storage.local.remove(["apiKey"], () => resolve());
  });
}

async function extensionFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status === 401) {
    await clearLocalApiKey();
  }
  return response;
}

async function withStoredSettings<T>(
  run: (settings: { apiKey: string; apiUrl: string }) => Promise<T>,
): Promise<T> {
  const result = await chrome.storage.local.get(["apiKey", "apiUrl"]);
  return run({
    apiKey: String(result.apiKey ?? ""),
    apiUrl: String(result.apiUrl ?? DEFAULT_API_URL),
  });
}

type SendResponse = (response: unknown) => void;

function handleRuntimeMessage(
  message: { type?: string; [key: string]: unknown },
  sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse,
): boolean {
  if (sender.id && sender.id !== chrome.runtime.id) {
    sendResponse({ success: false, error: "Expéditeur non autorisé." });
    return false;
  }
  if (sender.origin && !isAllowedSenderOrigin(sender.origin, sender)) {
    sendResponse({ success: false, error: "Origine non autorisée." });
    return false;
  }

  if (message.type === "GET_SETTINGS") {
    chrome.storage.local.get(["apiKey", "apiUrl"], (result) => {
      sendResponse(result);
    });
    return true;
  }
  if (message.type === "CLEAR_LOCAL_API_KEY") {
    void clearLocalApiKey().then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.type === "LISTING_CONFIRMED") {
    const url = String(message.externalUrl ?? "");
    if (!isMarketplaceItemUrl(url)) {
      sendResponse({
        success: false,
        error:
          "Ouvrez l’annonce publiée avant de confirmer. L’URL doit être https://www.facebook.com/marketplace/item/<id>/.",
      });
      return false;
    }

    void withStoredSettings(async ({ apiKey, apiUrl }) => {
      try {
        const response = await extensionFetch(`${apiUrl}/api/v1/extension/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
          body: JSON.stringify({
            eventType: "listing_created",
            vehicleId: message.vehicleId,
            metadata: {
              externalUrl: url,
              externalId: message.externalId ?? undefined,
              source: "extension",
            },
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          sendResponse({
            success: false,
            error: userFacingApiError(response.status, data),
            code: data.code,
          });
          return;
        }

        chrome.storage.local.remove(
          [PENDING_PUBLICATION_KEY, "pendingVehicle", "pendingStartedAt"],
          () => sendResponse({ success: true, ...data }),
        );
      } catch {
        sendResponse({
          success: false,
          error: "Suivia Auto est inaccessible. Réessayez depuis l’annonce.",
        });
      }
    });
    return true;
  }
  if (message.type === "START_MARKETPLACE") {
    const vehicle = message.vehicle as { id?: string; year?: number; make?: string; model?: string } | undefined;
    if (!vehicle?.id || !vehicle?.year || !vehicle?.make || !vehicle?.model) {
      sendResponse({
        success: false,
        error: "La fiche véhicule est incomplète.",
      });
      return false;
    }

    chrome.storage.local.set(
      {
        [PENDING_PUBLICATION_KEY]: { vehicle, startedAt: Date.now() },
      },
      () => {
        chrome.tabs.create(
          { url: "https://www.facebook.com/marketplace/create/vehicle" },
          () => {
            if (chrome.runtime.lastError) {
              sendResponse({
                success: false,
                error: "Marketplace n’a pas pu être ouvert.",
              });
              return;
            }
            sendResponse({ success: true });
          },
        );
      },
    );
    return true;
  }
  if (message.type === "GET_VEHICLE_PHOTO") {
    void withStoredSettings(async ({ apiKey, apiUrl }) => {
      try {
        const vehicleId = encodeURIComponent(String(message.vehicleId ?? ""));
        const index = Number.isInteger(message.index) ? message.index : 0;
        const response = await extensionFetch(
          `${apiUrl}/api/v1/extension/photos/${vehicleId}?index=${index}`,
          {
            headers: { "X-API-Key": apiKey },
          },
        );
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          sendResponse({
            success: false,
            error: userFacingApiError(
              response.status,
              data,
              "Photo inaccessible. Actualisez la fiche, puis réessayez.",
            ),
            code: (data as { code?: string }).code,
          });
          return;
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 0x8000),
          );
        }
        sendResponse({
          success: true,
          contentType: response.headers.get("content-type") ?? "image/jpeg",
          filename: response.headers.get("x-okauto-filename") ?? "vehicule.jpg",
          base64: btoa(binary),
        });
      } catch {
        sendResponse({
          success: false,
          error: "La photo n’a pas pu être préparée.",
        });
      }
    });
    return true;
  }
  if (message.type === "LINK_LISTINGS") {
    void withStoredSettings(async ({ apiKey, apiUrl }) => {
      try {
        const listings = Array.isArray(message.listings) ? message.listings : [];
        if (listings.length === 0) {
          sendResponse({
            success: false,
            error: "Aucune annonce Marketplace à relier.",
          });
          return;
        }
        const batches = chunkItems(listings, LINK_LISTINGS_MAX_BATCH);
        let counts = emptyLinkListingCounts();
        const results: unknown[] = [];
        for (const batch of batches) {
          const response = await extensionFetch(
            `${apiUrl}/api/v1/extension/link-listings`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey,
              },
              body: JSON.stringify({ listings: batch }),
            },
          );
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            sendResponse({
              success: false,
              error: userFacingApiError(
                response.status,
                data,
                "Les annonces n’ont pas pu être reliées. Réessayez.",
              ),
              code: data.code,
            });
            return;
          }
          counts = mergeLinkListingCounts(counts, data.counts);
          if (Array.isArray(data.results)) results.push(...data.results);
        }
        sendResponse({ success: true, counts, results });
      } catch {
        sendResponse({
          success: false,
          error: "Suivia Auto est inaccessible. Réessayez Relier mes annonces.",
        });
      }
    });
    return true;
  }
  if (message.type === "RELIER_LISTINGS") {
    chrome.tabs.query({ url: "https://www.facebook.com/marketplace/*" }, (tabs) => {
      const preferred =
        tabs.find((tab) => shouldBulkRelierOnTabUrl(tab.url)) ?? tabs[0];
      if (preferred?.id) {
        chrome.tabs.update(preferred.id, { active: true });
        chrome.tabs.sendMessage(
          preferred.id,
          { type: "RELIER_LISTINGS" },
          (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({
                success: false,
                error:
                  "Ouvrez un onglet Facebook Marketplace connecté, puis relancez Relier mes annonces.",
              });
              return;
            }
            sendResponse(response ?? { success: false });
          },
        );
        return;
      }
      chrome.storage.local.set({ [PENDING_RELIER_KEY]: true }, () => {
        chrome.tabs.create({ url: MARKETPLACE_SELLING_URL }, () => {
          sendResponse({
            success: true,
            openedSellingPage: true,
            error:
              "Onglet Facebook ouvert. Connectez-vous si besoin : Relier lira vos annonces dans cet onglet.",
          });
        });
      });
    });
    return true;
  }
  if (message.type === "REPORT_EXTENSION_EVENT") {
    void withStoredSettings(async ({ apiKey, apiUrl }) => {
      try {
        const response = await extensionFetch(`${apiUrl}/api/v1/extension/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
          body: JSON.stringify({
            eventType: message.eventType,
            vehicleId: message.vehicleId,
            listingId: message.listingId,
            metadata: message.metadata ?? {},
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          sendResponse({
            success: false,
            error: userFacingApiError(response.status, data),
            code: data.code,
          });
          return;
        }
        sendResponse({ success: true, ...data });
      } catch {
        sendResponse({
          success: false,
          error:
            "Suivia Auto est inaccessible. L’erreur de formulaire n’a pas pu être enregistrée.",
        });
      }
    });
    return true;
  }
  return false;
}

function isAllowedSenderOrigin(
  origin: string,
  sender: chrome.runtime.MessageSender,
): boolean {
  if (sender.tab?.url) {
    try {
      const tabOrigin = new URL(sender.tab.url).origin;
      if (/(^|\.)facebook\.com$/i.test(new URL(sender.tab.url).hostname)) {
        return origin === tabOrigin || origin === "https://www.facebook.com";
      }
    } catch {
      // Fall through to Suivia check.
    }
  }
  if (origin.startsWith("chrome-extension://")) {
    return origin === `chrome-extension://${chrome.runtime.id}`;
  }
  return isSuiviaWebOrigin(origin);
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("Suivia Auto Listing Assistant installed");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
  handleRuntimeMessage(message, sender, sendResponse),
);

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isSuiviaWebOrigin(sender.origin)) {
    sendResponse({ success: false, error: "Origine non autorisée." });
    return false;
  }
  return handleRuntimeMessage(message, sender, sendResponse);
});
