import { type BgRequest, type BgResponse, type Bootstrap, type ExtListing } from "./types.js";

function send<T>(message: BgRequest): Promise<BgResponse<T>> {
  return chrome.runtime.sendMessage(message) as Promise<BgResponse<T>>;
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function showError(message: string | null): void {
  const el = $("error");
  el.textContent = message ?? "";
  el.classList.toggle("hidden", message === null);
}

function show(section: "login" | "home"): void {
  $("login").classList.toggle("hidden", section !== "login");
  $("home").classList.toggle("hidden", section !== "home");
  $("signout").classList.toggle("hidden", section !== "home");
}

async function ensureHostPermission(apiBaseUrl: string): Promise<boolean> {
  try {
    const origin = `${new URL(apiBaseUrl).origin}/*`;
    const has = await chrome.permissions.contains({ origins: [origin] });
    if (has) return true;
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

async function loadHome(): Promise<void> {
  const res = await send<Bootstrap>({ kind: "bootstrap" });
  if (!res.ok) {
    if (res.status === 401) {
      show("login");
      return;
    }
    showError(res.error);
    show("login");
    return;
  }
  showError(null);
  const data = res.data;
  $("whoami").textContent =
    `${data.user.name} · ${data.organization.name} (${data.user.role.toLowerCase()})`;
  $("stat-active").textContent = String(data.counts.activeListings);
  $("stat-delist").textContent = String(data.counts.pendingDelists);
  $("stat-unread").textContent = String(data.counts.unreadNotifications);

  const settingsRes = await send<{ apiBaseUrl: string }>({ kind: "getSettings" });
  if (settingsRes.ok) {
    $("open-dashboard").setAttribute("href", settingsRes.data.apiBaseUrl);
  }

  const alert = $("delist-alert");
  const list = $("delist-list");
  list.replaceChildren();
  if (data.counts.pendingDelists > 0) {
    alert.textContent = `${data.counts.pendingDelists} of your listings must be removed from Marketplace (vehicle sold).`;
    alert.classList.remove("hidden");
    const listings = await send<{ listings: ExtListing[] }>({
      kind: "myListings",
      status: "DELIST_REQUESTED",
    });
    if (listings.ok) {
      for (const listing of listings.data.listings) {
        const li = document.createElement("li");
        const title = [listing.vehicle.year, listing.vehicle.make, listing.vehicle.model]
          .filter(Boolean)
          .join(" ");
        li.append(`${title} — delete your post`);
        if (listing.externalUrl) {
          li.append(" ");
          const a = document.createElement("a");
          a.href = listing.externalUrl;
          a.target = "_blank";
          a.rel = "noreferrer noopener";
          a.textContent = "open ↗";
          li.append(a);
        }
        li.append(" ");
        const done = document.createElement("button");
        done.textContent = "I removed it";
        done.style.marginTop = "6px";
        done.onclick = async () => {
          const result = await send({
            kind: "setListingStatus",
            listingId: listing.id,
            status: "DELISTED",
          });
          if (result.ok) void loadHome();
          else showError(result.error);
        };
        li.append(done);
        list.append(li);
      }
    }
  } else {
    alert.classList.add("hidden");
  }
  show("home");
}

async function init(): Promise<void> {
  const settings = await send<{ apiBaseUrl: string; hasToken: boolean }>({ kind: "getSettings" });
  if (settings.ok) {
    ($("apiBaseUrl") as HTMLInputElement).value = settings.data.apiBaseUrl;
    if (settings.data.hasToken) {
      await loadHome();
      return;
    }
  }
  show("login");
}

$("save").addEventListener("click", async () => {
  const apiBaseUrl = ($("apiBaseUrl") as HTMLInputElement).value.trim() || "http://localhost:3000";
  const token = ($("token") as HTMLInputElement).value.trim();
  if (!token) {
    showError("Paste an API token first.");
    return;
  }
  const granted = await ensureHostPermission(apiBaseUrl);
  if (!granted) {
    showError("Permission to contact your LotPilot server was declined.");
    return;
  }
  const saved = await send({ kind: "saveSettings", settings: { apiBaseUrl, token } });
  if (!saved.ok) {
    showError(saved.error);
    return;
  }
  await loadHome();
});

$("signout").addEventListener("click", async () => {
  await send({ kind: "clearSettings" });
  ($("token") as HTMLInputElement).value = "";
  show("login");
});

void init();
