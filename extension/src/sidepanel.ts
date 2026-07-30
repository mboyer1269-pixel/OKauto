import type { FillResult, PreparationPayload } from "./types";

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element ${id}`);
  return element as T;
};

const form = byId<HTMLFormElement>("load-form");
const apiUrl = byId<HTMLInputElement>("api-url");
const listingId = byId<HTMLInputElement>("listing-id");
const status = byId<HTMLParagraphElement>("status");
const review = byId<HTMLElement>("review");
const loadButton = byId<HTMLButtonElement>("load");
const fillButton = byId<HTMLButtonElement>("fill");
const photoButton = byId<HTMLButtonElement>("photos");
const confirmButton = byId<HTMLButtonElement>("confirm");
const externalUrl = byId<HTMLInputElement>("external-url");
const checks = [...document.querySelectorAll<HTMLInputElement>(".review-check")];
let payload: PreparationPayload | null = null;

void chrome.storage.sync.get(["apiUrl"]).then((stored: { apiUrl?: string }) => {
  if (stored.apiUrl) apiUrl.value = stored.apiUrl;
});

function report(message: string, error = false): void {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function originPattern(value: string): string {
  const url = new URL(value);
  return `${url.origin}/*`;
}

async function ensureApiPermission(value: string): Promise<void> {
  const pattern = originPattern(value);
  if (await chrome.permissions.contains({ origins: [pattern] })) return;
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) throw new Error("DriveFlow site access was not granted.");
}

async function loadPreparation(): Promise<void> {
  const base = new URL(apiUrl.value);
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("DriveFlow URL must use HTTP or HTTPS.");
  await ensureApiPermission(base.href);
  await chrome.storage.sync.set({ apiUrl: base.origin });
  const response = await fetch(new URL(`/api/v1/listings/${listingId.value.trim()}/prepare`, base), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-request-id": crypto.randomUUID() },
  });
  const result = (await response.json()) as { data?: PreparationPayload; error?: { message?: string } };
  if (!response.ok || !result.data) {
    if (response.status === 401) throw new Error("Sign in to DriveFlow in this Chrome profile, then try again.");
    throw new Error(result.error?.message ?? "Could not load this listing.");
  }
  if (result.data.contractVersion !== 1) throw new Error("Update the extension to support this DriveFlow API version.");
  if (result.data.policy.autoSubmit !== false || result.data.policy.humanConfirmationRequired !== true) {
    throw new Error("The server returned an unsupported publishing policy.");
  }
  payload = result.data;
  byId("vehicle-year").textContent = String(payload.year);
  byId("vehicle-title").textContent = payload.title;
  byId("vehicle-price").textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(payload.price);
  byId("vehicle-mileage").textContent = payload.mileage?.toLocaleString() ?? "Not provided";
  byId("vehicle-vin").textContent = payload.vin ?? "Not provided";
  byId("photo-count").textContent = String(payload.photos.length);
  byId<HTMLTextAreaElement>("description").value = payload.description;
  review.hidden = false;
  report("Prepared listing loaded. Complete each step; no external action is automatic.");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadButton.disabled = true;
  report("Loading secure preparation…");
  void loadPreparation()
    .catch((error: unknown) => report(error instanceof Error ? error.message : "Could not load the listing.", true))
    .finally(() => {
      loadButton.disabled = false;
    });
});

fillButton.addEventListener("click", () => {
  if (!payload) return;
  void chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
    if (!tab?.id || !tab.url?.startsWith("https://www.facebook.com/marketplace/create")) {
      throw new Error("Open a Facebook Marketplace create page in the active tab.");
    }
    const result = (await chrome.tabs.sendMessage(tab.id, { type: "DRIVEFLOW_FILL", payload })) as FillResult;
    report(result.message, result.missing.length > 0);
  }).catch((error: unknown) => report(error instanceof Error ? error.message : "Could not prepare fields.", true));
});

photoButton.addEventListener("click", () => {
  if (!payload) return;
  photoButton.disabled = true;
  report("Downloading approved vehicle photos…");
  void chrome.runtime.sendMessage({
    type: "DRIVEFLOW_DOWNLOAD_PHOTOS",
    urls: payload.photos,
    label: payload.title,
  }).then((result: { downloaded: number; failed: number }) => {
    report(`${result.downloaded} photo(s) downloaded${result.failed ? `; ${result.failed} failed` : ""}. Select them manually in Marketplace.`, result.failed > 0);
  }).catch(() => report("Photo download failed. Use the dealership media source manually.", true)).finally(() => {
    photoButton.disabled = false;
  });
});

for (const check of checks) {
  check.addEventListener("change", () => {
    confirmButton.disabled = !checks.every((item) => item.checked);
  });
}

confirmButton.addEventListener("click", () => {
  if (!payload || !checks.every((item) => item.checked)) return;
  const base = new URL(apiUrl.value);
  confirmButton.disabled = true;
  void fetch(new URL(`/api/v1/listings/${payload.listingId}/confirm`, base), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-request-id": crypto.randomUUID() },
    body: JSON.stringify({ action: "PUBLISHED", ...(externalUrl.value ? { externalUrl: externalUrl.value } : {}) }),
  }).then(async (response) => {
    const result = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) throw new Error(result.error?.message ?? "Confirmation failed.");
    report("Publication recorded. DriveFlow will now track this listing.");
  }).catch((error: unknown) => report(error instanceof Error ? error.message : "Confirmation failed.", true)).finally(() => {
    confirmButton.disabled = false;
  });
});
