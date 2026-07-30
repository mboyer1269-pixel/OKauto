/**
 * LotPilot content script — Marketplace listing assistant overlay.
 *
 * Renders a collapsible side panel on facebook.com/marketplace pages. The
 * panel lets a signed-in salesperson pick a vehicle from dealership
 * inventory, fill supported text fields (one explicit click per action),
 * copy values/photos/description for everything else, and confirm the final
 * Marketplace URL once *they* have published the listing themselves.
 *
 * It never clicks Facebook buttons, never auto-submits, and never touches
 * CAPTCHA/anti-bot/rate-limit mechanisms.
 */
import { fillField, marketplaceItemUrl, onVehicleCreatePage, type FieldKey } from "./fill.js";
import { type BgRequest, type BgResponse, type ExtVehicle } from "./types.js";

function send<T>(message: BgRequest): Promise<BgResponse<T>> {
  return chrome.runtime.sendMessage(message) as Promise<BgResponse<T>>;
}

interface PanelState {
  vehicles: ExtVehicle[];
  selected: ExtVehicle | null;
  listingId: string | null;
  query: string;
  status: string | null;
  error: string | null;
}

const state: PanelState = {
  vehicles: [],
  selected: null,
  listingId: null,
  query: "",
  status: null,
  error: null,
};

let panel: HTMLDivElement | null = null;
let fab: HTMLButtonElement | null = null;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  el.append(...children);
  return el;
}

function setStatus(message: string | null, isError = false): void {
  state.status = isError ? null : message;
  state.error = isError ? message : null;
  render();
}

async function copyText(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    setStatus(`${label} copied to clipboard`);
  } catch {
    setStatus(`Could not copy ${label} — select it manually`, true);
  }
}

async function loadVehicles(): Promise<void> {
  setStatus("Loading inventory…");
  const res = await send<{ vehicles: ExtVehicle[] }>({ kind: "listVehicles", q: state.query });
  if (!res.ok) {
    setStatus(res.error, true);
    return;
  }
  state.vehicles = res.data.vehicles;
  setStatus(null);
}

async function selectVehicle(vehicle: ExtVehicle): Promise<void> {
  const mine = vehicle.activeListings.find((l) => l.mine);
  const teammate = vehicle.activeListings.find((l) => !l.mine);
  if (teammate && !mine) {
    const proceed = window.confirm(
      `${teammate.by} already has an active listing for this vehicle. List it anyway?`,
    );
    if (!proceed) return;
  }
  state.selected = vehicle;
  state.listingId = null;

  if (mine) {
    state.listingId = mine.id;
    setStatus("Resuming your existing listing.");
    return;
  }
  const res = await send<{ listing: { id: string } }>({
    kind: "startListing",
    vehicleId: vehicle.id,
    force: Boolean(teammate),
  });
  if (!res.ok) {
    // 409 = already have one; refresh list to pick it up.
    setStatus(res.error, true);
    return;
  }
  state.listingId = res.data.listing.id;
  setStatus("Listing prepared — fill the form below, then publish it yourself.");
}

function fieldRows(
  vehicle: ExtVehicle,
): Array<{ key: FieldKey | null; label: string; value: string }> {
  const f = vehicle.marketplaceFields;
  const rows: Array<{ key: FieldKey | null; label: string; value: string }> = [
    { key: "year", label: "Year", value: f.year ?? "" },
    { key: "make", label: "Make", value: f.make },
    { key: "model", label: "Model", value: f.model },
    { key: "price", label: "Price", value: f.price ?? "" },
    { key: "mileage", label: "Mileage", value: f.mileage ?? "" },
    { key: null, label: "Body style", value: f.bodyStyle },
    { key: null, label: "Condition", value: f.condition },
    { key: null, label: "Fuel type", value: f.fuelType },
    { key: null, label: "Transmission", value: f.transmission },
    { key: "exteriorColor", label: "Exterior color", value: f.exteriorColor ?? "" },
    { key: "interiorColor", label: "Interior color", value: f.interiorColor ?? "" },
    {
      key: "description",
      label: "Description",
      value: f.description || (vehicle.description ?? ""),
    },
  ];
  return rows.filter((row) => row.value !== "");
}

async function fillOne(key: FieldKey, value: string, label: string): Promise<void> {
  const result = fillField(key, value);
  if (result.status === "filled") {
    setStatus(`Filled "${label}"`);
    if (state.listingId) {
      void send({
        kind: "reportEvent",
        listingId: state.listingId,
        type: "FILL_ASSIST_USED",
        data: { field: key },
      });
    }
  } else {
    await copyText(value, label);
    setStatus(
      `Couldn't find the "${label}" field (Facebook may have changed its form) — value copied, paste it manually.`,
      true,
    );
    if (state.listingId) {
      void send({
        kind: "reportEvent",
        listingId: state.listingId,
        type: "NOTE",
        data: { selectorDrift: key },
      });
    }
  }
}

async function fillAllText(vehicle: ExtVehicle): Promise<void> {
  if (!onVehicleCreatePage()) {
    setStatus("Open facebook.com/marketplace/create/vehicle first.", true);
    return;
  }
  let filled = 0;
  let missed = 0;
  for (const row of fieldRows(vehicle)) {
    if (!row.key) continue;
    const result = fillField(row.key, row.value);
    if (result.status === "filled") filled++;
    else missed++;
    // Small pacing delay between fills; behaves like assisted typing, not a bot burst.
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (state.listingId) {
    void send({
      kind: "reportEvent",
      listingId: state.listingId,
      type: "FILL_ASSIST_USED",
      data: { mode: "all", filled, missed },
    });
  }
  setStatus(
    missed === 0
      ? `Filled ${filled} fields. Select dropdowns (body style, condition…) manually, add photos, then publish.`
      : `Filled ${filled} fields; ${missed} not found — use the Copy buttons for those. Then publish yourself.`,
  );
}

async function markPosted(): Promise<void> {
  if (!state.listingId) return;
  const suggested = marketplaceItemUrl() ?? "";
  const url = window.prompt(
    "Paste the URL of your published Marketplace listing:",
    suggested || "https://www.facebook.com/marketplace/item/",
  );
  if (!url) return;
  const res = await send({
    kind: "setListingStatus",
    listingId: state.listingId,
    status: "POSTED",
    externalUrl: url,
  });
  if (!res.ok) {
    setStatus(res.error, true);
    return;
  }
  setStatus("Listing recorded as posted. It now shows up on your dealer dashboard.");
  state.selected = null;
  state.listingId = null;
  void loadVehicles();
}

function render(): void {
  if (!panel) return;
  panel.replaceChildren();

  const header = h("div", { class: "lp-header" }, [
    h("span", { class: "lp-logo" }, ["LotPilot"]),
    h("button", { class: "lp-close", "aria-label": "Close LotPilot panel" }, ["×"]),
  ]);
  header.querySelector<HTMLButtonElement>(".lp-close")!.onclick = () => togglePanel(false);
  panel.append(header);

  panel.append(
    h("p", { class: "lp-compliance" }, [
      "You review and publish every listing yourself. LotPilot never posts automatically.",
    ]),
  );

  if (state.error)
    panel.append(h("p", { class: "lp-alert lp-alert-error", role: "alert" }, [state.error]));
  if (state.status)
    panel.append(h("p", { class: "lp-alert lp-alert-info", role: "status" }, [state.status]));

  if (!state.selected) {
    const search = h("input", {
      class: "lp-input",
      type: "search",
      placeholder: "Search stock #, VIN, make…",
      "aria-label": "Search inventory",
      value: state.query,
    });
    search.oninput = (e) => {
      state.query = (e.target as HTMLInputElement).value;
    };
    search.onkeydown = (e) => {
      if (e.key === "Enter") void loadVehicles();
    };
    const searchBtn = h("button", { class: "lp-btn lp-btn-secondary" }, ["Search"]);
    searchBtn.onclick = () => void loadVehicles();
    panel.append(h("div", { class: "lp-row" }, [search, searchBtn]));

    const list = h("ul", { class: "lp-list" });
    for (const vehicle of state.vehicles) {
      const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
        .filter(Boolean)
        .join(" ");
      const item = h("li", { class: "lp-list-item" });
      const btn = h("button", { class: "lp-vehicle" }, [
        h("img", { src: vehicle.photos[0] ?? "", alt: "", loading: "lazy" }),
        h("span", { class: "lp-vehicle-meta" }, [
          h("strong", {}, [title]),
          h("small", {}, [
            `${vehicle.stockNumber ?? "—"} · ${vehicle.priceCents != null ? `$${Math.round(vehicle.priceCents / 100).toLocaleString()}` : "no price"}`,
          ]),
          vehicle.activeListings.length > 0
            ? h("small", { class: "lp-warn" }, [
                vehicle.activeListings.some((l) => l.mine)
                  ? "You already listed this"
                  : `Listed by ${vehicle.activeListings[0]!.by}`,
              ])
            : "",
        ]),
      ]);
      btn.onclick = () => void selectVehicle(vehicle);
      item.append(btn);
      list.append(item);
    }
    panel.append(list);
    return;
  }

  // Selected vehicle view
  const vehicle = state.selected;
  const back = h("button", { class: "lp-btn lp-btn-secondary" }, ["← Inventory"]);
  back.onclick = () => {
    state.selected = null;
    state.listingId = null;
    render();
  };
  panel.append(back);

  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  panel.append(h("h2", { class: "lp-title" }, [title]));

  if (onVehicleCreatePage()) {
    const fillAll = h("button", { class: "lp-btn lp-btn-primary" }, ["Fill text fields"]);
    fillAll.onclick = () => void fillAllText(vehicle);
    panel.append(fillAll);
  } else {
    const open = h(
      "a",
      {
        class: "lp-btn lp-btn-primary",
        href: "https://www.facebook.com/marketplace/create/vehicle",
      },
      ["Open vehicle listing form"],
    );
    panel.append(open);
  }

  const table = h("div", { class: "lp-fields" });
  for (const row of fieldRows(vehicle)) {
    const actions = h("span", { class: "lp-field-actions" });
    if (row.key && onVehicleCreatePage()) {
      const fill = h("button", { class: "lp-mini", "aria-label": `Fill ${row.label}` }, ["Fill"]);
      fill.onclick = () => void fillOne(row.key!, row.value, row.label);
      actions.append(fill);
    }
    const copy = h("button", { class: "lp-mini", "aria-label": `Copy ${row.label}` }, ["Copy"]);
    copy.onclick = () => void copyText(row.value, row.label);
    actions.append(copy);
    table.append(
      h("div", { class: "lp-field" }, [
        h("span", { class: "lp-field-label" }, [row.label]),
        h("span", { class: "lp-field-value", title: row.value }, [row.value]),
        actions,
      ]),
    );
  }
  panel.append(table);

  if (vehicle.photos.length > 0) {
    const photoHeader = h("div", { class: "lp-photos-header" }, [
      h("span", {}, [`Photos (${vehicle.photos.length})`]),
    ]);
    const copyPhotos = h("button", { class: "lp-mini" }, ["Copy URLs"]);
    copyPhotos.onclick = () => void copyText(vehicle.photos.join("\n"), "Photo URLs");
    photoHeader.append(copyPhotos);
    panel.append(photoHeader);
    const strip = h("div", { class: "lp-photo-strip" });
    for (const url of vehicle.photos.slice(0, 8)) {
      const link = h("a", { href: url, target: "_blank", rel: "noreferrer noopener" });
      link.append(h("img", { src: url, alt: "Vehicle photo", loading: "lazy" }));
      strip.append(link);
    }
    panel.append(strip);
    panel.append(
      h("p", { class: "lp-hint" }, [
        "Download the photos you want and add them to the Facebook form manually — Facebook requires you to attach photos yourself.",
      ]),
    );
  }

  if (state.listingId) {
    const posted = h("button", { class: "lp-btn lp-btn-success" }, [
      "I published it — record the URL",
    ]);
    posted.onclick = () => void markPosted();
    panel.append(posted);
  }
}

function togglePanel(show?: boolean): void {
  if (!panel || !fab) return;
  const visible = show ?? panel.classList.contains("lp-hidden");
  panel.classList.toggle("lp-hidden", !visible);
  fab.classList.toggle("lp-hidden", visible);
  if (visible && state.vehicles.length === 0) void loadVehicles();
}

function mount(): void {
  if (document.getElementById("lotpilot-panel")) return;
  panel = h("div", {
    id: "lotpilot-panel",
    class: "lp-hidden",
    role: "complementary",
    "aria-label": "LotPilot listing assistant",
  });
  fab = h("button", { id: "lotpilot-fab", "aria-label": "Open LotPilot listing assistant" }, [
    "LotPilot",
  ]);
  fab.onclick = () => togglePanel(true);
  document.body.append(panel, fab);
  render();
}

mount();
// Marketplace is a SPA; re-mount if navigation blows away our nodes.
const observer = new MutationObserver(() => {
  if (!document.getElementById("lotpilot-panel")) mount();
});
observer.observe(document.documentElement, { childList: true, subtree: false });
