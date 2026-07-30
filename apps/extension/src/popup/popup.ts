import { getSettings } from "../lib/storage.js";

interface QueueItem {
  id: string;
  title: string;
  priceCents: number | null;
  status: string;
  vehicle: { photos: { url: string }[]; year: number | null; make: string; model: string };
}

const $ = <T extends HTMLElement>(selector: string): T => document.querySelector(selector) as T;

function sendMessage<T = Record<string, unknown>>(message: Record<string, unknown>): Promise<T & { ok: boolean; error?: string }> {
  return chrome.runtime.sendMessage(message) as Promise<T & { ok: boolean; error?: string }>;
}

function showError(message: string | null): void {
  const el = $("#error");
  el.hidden = !message;
  el.textContent = message ?? "";
}

function formatPrice(cents: number | null): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

async function render(): Promise<void> {
  showError(null);
  const { pat } = await getSettings();
  $("#unpaired").hidden = Boolean(pat);
  $("#queue-section").hidden = !pat;
  if (!pat) return;

  const status = await sendMessage<{ ping?: { user: { name: string }; org: { name: string } } }>({ type: "GET_STATUS" });
  const pill = $("#status-pill");
  if (status.ok && status.ping) {
    pill.textContent = "connected";
    pill.className = "pill ok";
    $("#org-line").textContent = `${status.ping.org.name} — ${status.ping.user.name}`;
  } else {
    pill.textContent = "offline";
    pill.className = "pill bad";
    showError(status.error ?? "Could not reach the OKauto API. Check pairing settings.");
    return;
  }

  const queue = await sendMessage<{ items?: QueueItem[] }>({ type: "GET_QUEUE" });
  if (!queue.ok) {
    showError(queue.error ?? "Failed to load queue");
    return;
  }
  const list = $("#queue");
  list.innerHTML = "";
  const items = queue.items ?? [];
  $("#empty").hidden = items.length > 0;
  for (const item of items) {
    const li = document.createElement("li");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = item.title;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${formatPrice(item.priceCents)}${item.vehicle.photos.length ? ` • ${item.vehicle.photos.length} photos` : ""}`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Assist listing";
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Opening Marketplace…";
      const res = await sendMessage({ type: "START_ASSIST", listingId: item.id });
      if (!res.ok) {
        showError(res.error ?? "Could not start assist");
        button.disabled = false;
        button.textContent = "Assist listing";
      } else {
        button.textContent = "Assist running in tab";
        window.close();
      }
    });
    li.append(title, meta, button);
    list.appendChild(li);
  }
}

$("#refresh").addEventListener("click", () => void render());
for (const id of ["#open-options", "#open-options-2"]) {
  $(id).addEventListener("click", () => void chrome.runtime.openOptionsPage());
}
$("#open-dashboard").addEventListener("click", async () => {
  const { apiUrl } = await getSettings();
  const dashboard = apiUrl.includes("localhost") ? "http://localhost:3000" : apiUrl.replace(/\/api\/?$/, "");
  await chrome.tabs.create({ url: dashboard });
});

void render();
void sendMessage({ type: "BADGE_REFRESH" });
