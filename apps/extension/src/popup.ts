type Vehicle = {
  id: string;
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  stockNumber: string;
  priceCents: number;
  mileage?: number | null;
  bodyStyle?: string | null;
  exteriorColor?: string | null;
  description?: string | null;
  media: Array<{ url: string }>;
};

type AlertListing = {
  id: string;
  status: string;
  vehicle: { year: number; make: string; model: string; stockNumber: string };
};

async function getConfig() {
  return chrome.storage.local.get(["apiBase", "token"]);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const cfg = await getConfig();
  if (!cfg.apiBase || !cfg.token) throw new Error("Not connected");
  const res = await fetch(`${cfg.apiBase}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

function $(id: string) {
  return document.getElementById(id)!;
}

async function refreshVehicles() {
  const q = ($("search") as HTMLInputElement).value.trim();
  const data = await api<{
    vehicles: Vehicle[];
    alerts: AlertListing[];
  }>(`/api/v1/extension/vehicles${q ? `?q=${encodeURIComponent(q)}` : ""}`);

  const alerts = $("alerts");
  alerts.innerHTML = data.alerts
    .map(
      (a) =>
        `<div class="alert"><strong>${a.status}</strong><div>${a.vehicle.year} ${a.vehicle.make} ${a.vehicle.model} (${a.vehicle.stockNumber})</div></div>`,
    )
    .join("");

  const root = $("vehicles");
  root.innerHTML = data.vehicles
    .map((v) => {
      const title = `${v.year} ${v.make} ${v.model} ${v.trim ?? ""}`.trim();
      return `<article class="card" data-id="${v.id}">
        <h3>${title}</h3>
        <div class="muted">${v.stockNumber} · $${(v.priceCents / 100).toLocaleString()}</div>
        <div class="actions">
          <button type="button" data-action="assist" data-id="${v.id}">Assist fill</button>
        </div>
      </article>`;
    })
    .join("");

  root.querySelectorAll<HTMLButtonElement>("[data-action='assist']").forEach((btn) => {
    btn.addEventListener("click", () => assist(btn.dataset.id!));
  });
}

async function assist(vehicleId: string) {
  const created = await api<{
    listing: { id: string };
    assist: {
      marketplaceCreateUrl: string;
      payload: {
        title: string;
        price: number;
        description: string;
        year: number;
        make: string;
        model: string;
        mileage?: number | null;
        bodyStyle?: string | null;
        exteriorColor?: string | null;
        photos: string[];
      };
    };
  }>("/api/v1/listings", {
    method: "POST",
    body: JSON.stringify({ vehicleId }),
  });

  await api(`/api/v1/listings/${created.listing.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "ASSISTING" }),
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const createUrl = created.assist.marketplaceCreateUrl;
  let targetTabId = tab?.id;

  if (!tab?.url?.includes("facebook.com/marketplace")) {
    const newTab = await chrome.tabs.create({ url: createUrl });
    targetTabId = newTab.id;
    await new Promise((r) => setTimeout(r, 2500));
  }

  if (!targetTabId) return;

  const result = await chrome.tabs.sendMessage(targetTabId, {
    type: "OKAUTO_ASSIST_FILL",
    payload: created.assist.payload,
  });

  if (result?.captchaDetected || result?.checkpointDetected) {
    $("authStatus").textContent =
      "Facebook challenge detected. Complete it yourself, then click Assist fill again.";
    return;
  }

  const mark = confirm(
    `Filled: ${(result?.filled ?? []).join(", ") || "none"}.\nMissing: ${(result?.missing ?? []).join(", ") || "none"}.\n\nDid you publish the listing manually?`,
  );
  if (mark) {
    await api(`/api/v1/listings/${created.listing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "PUBLISHED" }),
    });
  }
  await refreshVehicles();
}

async function init() {
  const cfg = await getConfig();
  ($("apiBase") as HTMLInputElement).value = cfg.apiBase ?? "http://localhost:3000";
  ($("token") as HTMLInputElement).value = cfg.token ?? "";

  if (cfg.token) {
    $("auth").hidden = true;
    $("main").hidden = false;
    try {
      await api("/api/v1/me");
      $("authStatus").textContent = "Connected";
      await refreshVehicles();
    } catch (err) {
      $("auth").hidden = false;
      $("main").hidden = true;
      $("authStatus").textContent = err instanceof Error ? err.message : "Auth failed";
    }
  }

  $("saveAuth").addEventListener("click", async () => {
    const apiBase = ($("apiBase") as HTMLInputElement).value.trim().replace(/\/$/, "");
    const token = ($("token") as HTMLInputElement).value.trim();
    await chrome.storage.local.set({ apiBase, token });
    try {
      await api("/api/v1/me");
      $("auth").hidden = true;
      $("main").hidden = false;
      $("authStatus").textContent = "Connected";
      await refreshVehicles();
    } catch (err) {
      $("authStatus").textContent = err instanceof Error ? err.message : "Auth failed";
    }
  });

  $("disconnect").addEventListener("click", async () => {
    await chrome.storage.local.remove(["token"]);
    $("auth").hidden = false;
    $("main").hidden = true;
  });

  $("refresh").addEventListener("click", () => refreshVehicles().catch(console.error));
  $("search").addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") refreshVehicles().catch(console.error);
  });
}

init().catch(console.error);
