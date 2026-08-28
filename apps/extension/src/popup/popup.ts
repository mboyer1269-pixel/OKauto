export {};

interface Vehicle {
  id: string;
  vin?: string;
  stockNumber?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  mileage?: number;
  price?: number;
  description?: string;
  title?: string;
  contactName?: string;
  dealershipName?: string;
  phone?: string;
  exteriorColor?: string;
  interiorColor?: string;
  bodyStyle?: string;
  condition?: string;
  fuelType?: string;
  transmission?: string;
  drivetrain?: string;
  engine?: string;
  features?: string[];
  photos?: string[];
  photoCount?: number;
  hasActiveListing?: boolean;
}

interface Settings {
  apiKey: string;
  apiUrl: string;
}

const MARKETPLACE_CREATE_URL =
  "https://www.facebook.com/marketplace/create/vehicle";
const PENDING_PUBLICATION_KEY = "pendingPublication";
const DEFAULT_API_URL = "https://suivia.ca";

function isMarketplaceCreateUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      /(^|\.)facebook\.com$/i.test(url.hostname) &&
      url.pathname.startsWith("/marketplace/create")
    );
  } catch {
    return false;
  }
}
let inventory: Vehicle[] = [];

async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["apiKey", "apiUrl"], (result) => {
      resolve({
        apiKey: (result.apiKey as string) ?? "",
        apiUrl: (result.apiUrl as string) ?? DEFAULT_API_URL,
      });
    });
  });
}

async function saveSettings(settings: Settings) {
  return new Promise<void>((resolve) => {
    chrome.storage.local.set(settings, resolve);
  });
}

async function apiFetch(
  path: string,
  settings: Settings,
  options: RequestInit = {},
) {
  const headers = new Headers(options.headers);
  headers.set("X-API-Key", settings.apiKey);
  if (options.body) headers.set("Content-Type", "application/json");
  return fetch(`${settings.apiUrl}${path}`, { ...options, headers });
}

function showError(msg: string) {
  const el = document.getElementById("error")!;
  el.textContent = msg;
  el.style.display = "block";
}

function hideError() {
  const el = document.getElementById("error")!;
  el.style.display = "none";
}

function renderVehicles(vehicles: Vehicle[]) {
  const list = document.getElementById("vehicle-list")!;
  const loading = document.getElementById("loading")!;
  loading.style.display = "none";

  if (vehicles.length === 0) {
    const status = document.createElement("div");
    status.className = "status";
    status.textContent = "Aucun véhicule trouvé.";
    list.replaceChildren(status);
    return;
  }

  const cards = vehicles.map((vehicle) => {
    const card = document.createElement("div");
    card.className = "vehicle-card";

    const thumbnail = vehicle.photos?.[0];
    if (thumbnail && isSafeImageUrl(thumbnail)) {
      const image = document.createElement("img");
      image.src = thumbnail;
      image.alt = "";
      image.loading = "lazy";
      card.append(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "vehicle-placeholder";
      card.append(placeholder);
    }

    const info = document.createElement("div");
    info.className = "vehicle-info";
    const heading = document.createElement("h3");
    heading.textContent = [vehicle.year, vehicle.make, vehicle.model]
      .filter(Boolean)
      .join(" ");
    const details = document.createElement("p");
    details.textContent = [
      vehicle.stockNumber ? `Stock ${vehicle.stockNumber}` : null,
      `${vehicle.mileage?.toLocaleString("fr-CA") ?? "—"} km`,
      `${vehicle.price?.toLocaleString("fr-CA") ?? "—"} $ CA`,
      vehicle.photoCount ? `${vehicle.photoCount} photos` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    info.append(heading, details);
    if (vehicle.hasActiveListing) {
      const badge = document.createElement("span");
      badge.className = "badge badge-listed";
      badge.textContent = "Publiée par vous";
      info.append(badge);
    }

    const button = document.createElement("button");
    button.className = "btn-assist";
    button.textContent = vehicle.hasActiveListing ? "Déjà publiée" : "Publier";
    button.disabled = Boolean(vehicle.hasActiveListing);
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Préparation…";
      await assistListing(vehicle, button);
    });

    card.append(info, button);
    return card;
  });
  list.replaceChildren(...cards);
}

function isSafeImageUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function loadInventory(settings: Settings, search = "") {
  hideError();
  document.getElementById("loading")!.style.display = "block";
  document.getElementById("vehicle-list")!.innerHTML = "";

  try {
    const params = new URLSearchParams({ limit: "50", page: "1" });
    if (search) params.set("search", search);
    const res = await apiFetch(`/api/v1/extension?${params}`, settings);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Failed to load inventory");
    }
    const data = await res.json();
    document.getElementById("org-name")!.textContent =
      data.organization?.name ?? "Listing Assistant";
    inventory = (data.vehicles ?? []).map((vehicle: Vehicle) => ({
      ...vehicle,
      contactName: vehicle.contactName || data.user?.name,
      dealershipName: vehicle.dealershipName || data.organization?.name,
      phone: vehicle.phone || data.organization?.phone,
    }));
    renderVehicles(inventory);
  } catch (err) {
    document.getElementById("loading")!.style.display = "none";
    showError(err instanceof Error ? err.message : "Connexion impossible");
  }
}

async function assistListing(vehicle: Vehicle, button?: HTMLButtonElement) {
  const settings = await getSettings();
  if (!settings.apiKey) {
    showError("Ajoutez une clé API dans l’onglet Réglages.");
    return;
  }

  try {
    const response = await apiFetch(
      `/api/v1/extension/vehicles/${encodeURIComponent(vehicle.id)}`,
      settings,
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.vehicle) {
      throw new Error(data.error ?? "La fiche complète est inaccessible.");
    }
    vehicle = data.vehicle as Vehicle;
  } catch (error) {
    showError(
      error instanceof Error ? error.message : "Préparation impossible.",
    );
    if (button) {
      button.disabled = false;
      button.textContent = "Publier";
    }
    return;
  }

  await chrome.storage.local.set({
    [PENDING_PUBLICATION_KEY]: { vehicle, startedAt: Date.now() },
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab?.url && isMarketplaceCreateUrl(tab.url)) {
    chrome.tabs.sendMessage(tab.id!, {
      type: "FILL_MARKETPLACE_FORM",
      vehicle,
    });
    window.close();
  } else {
    chrome.tabs.create({ url: MARKETPLACE_CREATE_URL });
    window.close();
  }
}

// Tab switching
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const tabName = (tab as HTMLElement).dataset.tab!;
    document.getElementById("tab-inventory")!.style.display =
      tabName === "inventory" ? "block" : "none";
    document.getElementById("tab-settings")!.style.display =
      tabName === "settings" ? "block" : "none";
  });
});

// Settings
document
  .getElementById("save-settings")!
  .addEventListener("click", async () => {
    const apiUrl = (document.getElementById("api-url") as HTMLInputElement)
      .value;
    const apiKey = (document.getElementById("api-key") as HTMLInputElement)
      .value;
    await saveSettings({ apiUrl, apiKey });

    const res = await apiFetch(
      "/api/v1/extension",
      { apiUrl, apiKey },
      {
        method: "POST",
        body: JSON.stringify({ apiKey }),
      },
    );

    if (res.ok) {
      hideError();
      document
        .querySelector('[data-tab="inventory"]')!
        .dispatchEvent(new Event("click"));
      loadInventory({ apiUrl, apiKey });
    } else {
      showError("Clé API ou URL invalide.");
    }
  });

let searchTimer: number | undefined;
document
  .getElementById("vehicle-search")!
  .addEventListener("input", (event) => {
    window.clearTimeout(searchTimer);
    const query = (event.target as HTMLInputElement).value.trim();
    searchTimer = window.setTimeout(async () => {
      const settings = await getSettings();
      await loadInventory(settings, query);
    }, 250);
  });

// Init
(async () => {
  const settings = await getSettings();
  (document.getElementById("api-url") as HTMLInputElement).value =
    settings.apiUrl;
  (document.getElementById("api-key") as HTMLInputElement).value =
    settings.apiKey;

  if (settings.apiKey) {
    loadInventory(settings);
  } else {
    document.getElementById("loading")!.style.display = "none";
    const status = document.createElement("div");
    status.className = "status";
    status.textContent = "Ajoutez votre clé API dans Réglages pour commencer.";
    document.getElementById("vehicle-list")!.replaceChildren(status);
  }
})();
