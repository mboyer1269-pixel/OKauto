import { ExtApiError, apiFetch, getSession, saveSession } from "./api.js";
import type { ExtMessage, MarketplaceDraft, StoredSession } from "./types.js";

/**
 * Side panel: the salesperson's cockpit. Shows sold alerts that need action,
 * searchable available inventory, and one-click "List on Marketplace" which
 * opens the create form with the draft ready to fill.
 */

const root = document.getElementById("root")!;
let session: StoredSession | null = null;
let query = "";
let statusText = "";

interface VehicleRow {
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  priceCents: number | null;
  status: string;
  activeListingCount: number;
}

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  meta: { vehicleId?: string; listingId?: string };
}

function h(html: string): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild as HTMLElement;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function money(cents: number | null): string {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

async function render(): Promise<void> {
  session = await getSession();
  if (!session || !session.currentOrgId) {
    root.innerHTML = `<main><p class="muted">Sign in from the OpenLot toolbar popup to see your inventory.</p></main>`;
    return;
  }
  const orgId = session.currentOrgId;

  root.innerHTML = "";
  const header = h(`
    <header>
      <h1><span>OpenLot · ${esc(session.orgs.find((o) => o.orgId === orgId)?.name ?? "Inventory")}</span>
        <button class="ghost" id="refresh" title="Refresh">↻</button></h1>
      <input id="search" placeholder="Search make, model, VIN…" value="${esc(query)}" aria-label="Search inventory" />
    </header>
  `);
  root.appendChild(header);
  const main = h(`<main><div class="status" id="status">${esc(statusText)}</div><div class="muted">Loading…</div></main>`);
  root.appendChild(main);

  header.querySelector("#refresh")!.addEventListener("click", () => void render());
  const searchInput = header.querySelector<HTMLInputElement>("#search")!;
  let debounce: ReturnType<typeof setTimeout>;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      query = searchInput.value;
      void loadContent(main, orgId);
    }, 300);
  });

  await loadContent(main, orgId);
}

async function loadContent(main: HTMLElement, orgId: string): Promise<void> {
  try {
    const [alerts, inventory] = await Promise.all([
      apiFetch<{ items: NotificationRow[] }>(`/api/v1/notifications?unreadOnly=true&pageSize=10`),
      apiFetch<{ items: VehicleRow[] }>(
        `/api/v1/orgs/${orgId}/vehicles?status=AVAILABLE&pageSize=50${query ? `&q=${encodeURIComponent(query)}` : ""}`,
      ),
    ]);
    main.innerHTML = `<div class="status" id="status">${esc(statusText)}</div>`;
    statusText = "";

    const actionable = alerts.items.filter((n) => n.type === "VEHICLE_SOLD" || n.type === "PRICE_CHANGED");
    for (const alert of actionable) {
      const card = h(`
        <div class="alert">
          <strong>${esc(alert.title)}</strong><br/>${esc(alert.body)}<br/>
          <button class="ghost" data-id="${alert.id}">Dismiss</button>
        </div>
      `);
      card.querySelector("button")!.addEventListener("click", async () => {
        await apiFetch(`/api/v1/notifications/${alert.id}/read`, { method: "POST", body: {} });
        await chrome.runtime.sendMessage({ kind: "REFRESH_BADGE" } satisfies ExtMessage);
        card.remove();
      });
      main.appendChild(card);
    }

    if (inventory.items.length === 0) {
      main.appendChild(h(`<p class="muted">No available vehicles${query ? " match your search" : ""}.</p>`));
      return;
    }

    for (const v of inventory.items) {
      const title = `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`;
      const card = h(`
        <div class="card">
          <div class="vt">${esc(title)} ${v.activeListingCount > 0 ? '<span class="badge b-live">LIVE</span>' : ""}</div>
          <div class="vs">${esc(v.vin)} · ${v.mileage !== null ? v.mileage.toLocaleString() + " mi" : "mileage n/a"} ·
            <span class="price">${money(v.priceCents)}</span></div>
          <button class="primary">List on Marketplace</button>
        </div>
      `);
      const btn = card.querySelector<HTMLButtonElement>("button")!;
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Preparing…";
        try {
          await startListing(orgId, v.id);
          setStatus(`Opening Marketplace for the ${title}. Use the overlay to auto-fill.`);
        } catch (err) {
          setStatus(err instanceof Error ? err.message : "Could not start listing");
        } finally {
          btn.disabled = false;
          btn.textContent = "List on Marketplace";
        }
      });
      main.appendChild(card);
    }
  } catch (err) {
    if (err instanceof ExtApiError && err.status === 401) {
      await saveSession(null);
      await render();
      return;
    }
    main.innerHTML = `<p class="muted">${esc(err instanceof Error ? err.message : "Failed to load")}</p>`;
  }
}

function setStatus(text: string): void {
  statusText = text;
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

async function startListing(orgId: string, vehicleId: string): Promise<void> {
  // Create the listing intent; if a live one exists, reuse it.
  let listingId: string;
  try {
    const res = await apiFetch<{ listing: { id: string } }>(`/api/v1/orgs/${orgId}/listings`, {
      method: "POST",
      body: { vehicleId },
    });
    listingId = res.listing.id;
  } catch (err) {
    const existing = (err as ExtApiError)?.details as { listingId?: string } | undefined;
    if (err instanceof ExtApiError && err.status === 409 && existing?.listingId) {
      listingId = existing.listingId;
    } else {
      throw err;
    }
  }
  const { draft } = await apiFetch<{ draft: MarketplaceDraft }>(
    `/api/v1/orgs/${orgId}/vehicles/${vehicleId}/marketplace-draft`,
  );
  const response = await chrome.runtime.sendMessage({
    kind: "START_LISTING",
    pending: { listingId, orgId, draft },
  } satisfies ExtMessage);
  if (!response?.ok) throw new Error(response?.error ?? "Could not open Marketplace tab");
}

void render();
