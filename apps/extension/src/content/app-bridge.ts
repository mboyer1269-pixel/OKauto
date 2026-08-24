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

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin)
    return;
  if (event.data?.source !== APP_MESSAGE_SOURCE) return;

  if (event.data.type === "OKAUTO_EXTENSION_PING") {
    announce("OKAUTO_EXTENSION_READY");
    return;
  }

  if (event.data.type !== "OKAUTO_START_MARKETPLACE") return;
  if (!validVehicle(event.data.vehicle)) {
    announce("OKAUTO_EXTENSION_RESULT", {
      success: false,
      error: "La fiche véhicule est incomplète.",
    });
    return;
  }

  chrome.runtime.sendMessage(
    { type: "START_MARKETPLACE", vehicle: event.data.vehicle },
    (response) => {
      announce("OKAUTO_EXTENSION_RESULT", {
        success: Boolean(response?.success),
        error: response?.error,
      });
    },
  );
});

announce("OKAUTO_EXTENSION_READY");
