import { isSuiviaWebOrigin } from "@okauto/shared";

interface MarketplaceVehicle {
  id: string;
  vin?: string | null;
  stockNumber?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  mileage?: number | null;
  price?: number | null;
  title?: string | null;
  description?: string | null;
  contactName?: string | null;
  dealershipName?: string | null;
  phone?: string | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  bodyStyle?: string | null;
  condition?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  engine?: string | null;
  features?: string[];
  photos?: string[];
}

const APP_MESSAGE_SOURCE = "okauto-web";
const EXTENSION_MESSAGE_SOURCE = "okauto-extension";

function announce(type: string, detail: Record<string, unknown> = {}) {
  window.postMessage(
    { source: EXTENSION_MESSAGE_SOURCE, type, ...detail },
    window.location.origin,
  );
}

function validVehicle(value: unknown): value is MarketplaceVehicle {
  if (!value || typeof value !== "object") return false;
  const vehicle = value as MarketplaceVehicle;
  return Boolean(
    vehicle.id &&
    typeof vehicle.id === "string" &&
    typeof vehicle.year === "number" &&
    typeof vehicle.make === "string" &&
    typeof vehicle.model === "string",
  );
}

function echoNonce(data: { nonce?: unknown }): { nonce?: string } {
  return typeof data.nonce === "string" ? { nonce: data.nonce } : {};
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (!isSuiviaWebOrigin(event.origin) || event.origin !== window.location.origin)
    return;
  if (event.data?.source !== APP_MESSAGE_SOURCE) return;

  if (event.data.type === "OKAUTO_EXTENSION_PING") {
    announce("OKAUTO_EXTENSION_READY", echoNonce(event.data));
    return;
  }

  if (event.data.type === "OKAUTO_RELIER_LISTINGS") {
    chrome.runtime.sendMessage({ type: "RELIER_LISTINGS" }, (response) => {
      announce("OKAUTO_RELIER_RESULT", {
        ...echoNonce(event.data),
        success: Boolean(response?.success),
        openedSellingPage: Boolean(response?.openedSellingPage),
        counts: response?.counts,
        results: response?.results,
        error: chrome.runtime.lastError
          ? "Relier mes annonces n’a pas pu joindre l’extension. Rechargez Suivia, puis réessayez."
          : response?.error,
      });
    });
    return;
  }

  if (event.data.type !== "OKAUTO_START_MARKETPLACE") return;
  if (!validVehicle(event.data.vehicle)) {
    announce("OKAUTO_EXTENSION_RESULT", {
      ...echoNonce(event.data),
      success: false,
      error: "La fiche véhicule est incomplète.",
    });
    return;
  }

  chrome.runtime.sendMessage(
    { type: "START_MARKETPLACE", vehicle: event.data.vehicle },
    (response) => {
      announce("OKAUTO_EXTENSION_RESULT", {
        ...echoNonce(event.data),
        success: Boolean(response?.success),
        error: chrome.runtime.lastError
          ? "Marketplace n’a pas pu être ouvert. Rechargez Suivia, puis réessayez."
          : response?.error,
      });
    },
  );
});

announce("OKAUTO_EXTENSION_READY");
