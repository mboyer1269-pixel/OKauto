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
    list.innerHTML = '<div class="status">Aucun véhicule trouvé.</div>';
    return;
  }

  list.innerHTML = vehicles
    .map(
      (v) => `
    <div class="vehicle-card" data-id="${v.id}">
      ${v.photos?.[0] ? `<img src="${v.photos[0]}" alt="" />` : '<div style="width:60px;height:45px;background:#f1f5f9;border-radius:4px"></div>'}
      <div class="vehicle-info">
        <h3>${v.year} ${v.make} ${v.model}</h3>
        <p>${v.stockNumber ? `Stock ${v.stockNumber} · ` : ""}${v.mileage?.toLocaleString("fr-CA") ?? "—"} km · ${v.price?.toLocaleString("fr-CA") ?? "—"} $ CA</p>
        ${v.hasActiveListing ? '<span class="badge badge-listed">Publiée</span>' : ""}
      </div>
      <button class="btn-assist" data-assist="${v.id}">Publier</button>
    </div>
  `,
    )
    .join("");

  list.querySelectorAll("[data-assist]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = (btn as HTMLElement).dataset.assist!;
      const vehicle = vehicles.find((v) => v.id === id);
      if (vehicle) await assistListing(vehicle);
    });
  });
}

async function loadInventory(settings: Settings) {
  hideError();
  document.getElementById("loading")!.style.display = "block";
  document.getElementById("vehicle-list")!.innerHTML = "";

  try {
    const res = await apiFetch("/api/v1/extension", settings);
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

async function assistListing(vehicle: Vehicle) {
  const settings = await getSettings();
  if (!settings.apiKey) {
    showError("Ajoutez une clé API dans l’onglet Réglages.");
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

document
  .getElementById("vehicle-search")!
  .addEventListener("input", (event) => {
    const query = (event.target as HTMLInputElement).value.trim().toLowerCase();
    renderVehicles(
      inventory.filter((vehicle) =>
        [
          vehicle.year,
          vehicle.make,
          vehicle.model,
          vehicle.trim,
          vehicle.stockNumber,
          vehicle.vin,
        ].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(query),
        ),
      ),
    );
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
    document.getElementById("vehicle-list")!.innerHTML =
      '<div class="status">Ajoutez votre clé API dans Réglages pour commencer.</div>';
  }
})();
