export {};

const PENDING_PUBLICATION_KEY = "pendingPublication";
const DEFAULT_API_URL = "https://suivia.ca";

function isMarketplaceItemUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      /(^|\.)facebook\.com$/i.test(url.hostname) &&
      /^\/marketplace\/item\/[^/]+/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

// Suivia Auto background service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log("Suivia Auto Listing Assistant installed");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_SETTINGS") {
    chrome.storage.local.get(["apiKey", "apiUrl"], (result) => {
      sendResponse(result);
    });
    return true;
  }
  if (message.type === "LISTING_CONFIRMED") {
    const url = String(message.externalUrl ?? "");
    if (!isMarketplaceItemUrl(url)) {
      sendResponse({
        success: false,
        error:
          "Ouvrez l’annonce publiée avant de confirmer. L’URL doit contenir /marketplace/item/.",
      });
      return false;
    }

    chrome.storage.local.get(["apiKey", "apiUrl"], async (result) => {
      try {
        const apiUrl = String(result.apiUrl ?? DEFAULT_API_URL);
        const response = await fetch(`${apiUrl}/api/v1/extension/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": String(result.apiKey ?? ""),
          },
          body: JSON.stringify({
            eventType: "listing_created",
            vehicleId: message.vehicleId,
            metadata: { externalUrl: url, source: "extension" },
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          sendResponse({ success: false, error: data.error });
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
    const vehicle = message.vehicle;
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
    chrome.storage.local.get(["apiKey", "apiUrl"], async (result) => {
      try {
        const apiUrl = String(result.apiUrl ?? DEFAULT_API_URL);
        const apiKey = String(result.apiKey ?? "");
        const vehicleId = encodeURIComponent(String(message.vehicleId ?? ""));
        const index = Number.isInteger(message.index) ? message.index : 0;
        const response = await fetch(
          `${apiUrl}/api/v1/extension/photos/${vehicleId}?index=${index}`,
          {
            headers: { "X-API-Key": apiKey },
          },
        );
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          sendResponse({
            success: false,
            error: data.error ?? "Photo inaccessible.",
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
  return false;
});
