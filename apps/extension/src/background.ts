/**
 * LotPilot MV3 service worker.
 * Owns the API token (chrome.storage.local) and performs all API calls, so
 * the content script never handles credentials. No interaction with Facebook
 * pages happens here — only calls to the dealer's own LotPilot server.
 */
import { type BgRequest, type BgResponse, type Settings } from "./types.js";

const DEFAULT_SETTINGS: Settings = { apiBaseUrl: "http://localhost:3000", token: "" };

async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(["apiBaseUrl", "token"]);
  return {
    apiBaseUrl:
      typeof stored.apiBaseUrl === "string" && stored.apiBaseUrl !== ""
        ? stored.apiBaseUrl
        : DEFAULT_SETTINGS.apiBaseUrl,
    token: typeof stored.token === "string" ? stored.token : "",
  };
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<BgResponse<T>> {
  const settings = await getSettings();
  if (!settings.token)
    return {
      ok: false,
      status: 401,
      error: "Not signed in. Open the LotPilot popup and add your API token.",
    };
  try {
    const res = await fetch(`${settings.apiBaseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${settings.token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error:
          (data as { error?: { message?: string } })?.error?.message ??
          `Request failed (${res.status})`,
      };
    }
    return { ok: true, data: data as T };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? `Cannot reach LotPilot server: ${err.message}` : "Network error",
    };
  }
}

async function handle(request: BgRequest): Promise<BgResponse> {
  switch (request.kind) {
    case "getSettings": {
      const settings = await getSettings();
      // Never expose the raw token to content-script contexts beyond presence.
      return {
        ok: true,
        data: { apiBaseUrl: settings.apiBaseUrl, hasToken: settings.token !== "" },
      };
    }
    case "saveSettings": {
      await chrome.storage.local.set({
        apiBaseUrl: request.settings.apiBaseUrl.replace(/\/$/, ""),
        token: request.settings.token,
      });
      return { ok: true, data: null };
    }
    case "clearSettings": {
      await chrome.storage.local.remove(["token"]);
      return { ok: true, data: null };
    }
    case "bootstrap":
      return apiFetch("/api/v1/ext/bootstrap");
    case "listVehicles": {
      const params = new URLSearchParams();
      if (request.q) params.set("q", request.q);
      if (request.page) params.set("page", String(request.page));
      return apiFetch(`/api/v1/ext/vehicles?${params}`);
    }
    case "myListings": {
      const params = new URLSearchParams();
      if (request.status) params.set("status", request.status);
      return apiFetch(`/api/v1/ext/listings?${params}`);
    }
    case "startListing":
      return apiFetch("/api/v1/ext/listings", {
        method: "POST",
        body: JSON.stringify({ vehicleId: request.vehicleId, force: request.force ?? false }),
      });
    case "reportEvent":
      return apiFetch(`/api/v1/ext/listings/${request.listingId}/events`, {
        method: "POST",
        body: JSON.stringify({ type: request.type, data: request.data ?? {} }),
      });
    case "setListingStatus":
      return apiFetch(`/api/v1/ext/listings/${request.listingId}/status`, {
        method: "POST",
        body: JSON.stringify({
          status: request.status,
          externalUrl: request.externalUrl,
          errorMessage: request.errorMessage,
        }),
      });
  }
}

chrome.runtime.onMessage.addListener((message: BgRequest, _sender, sendResponse) => {
  void handle(message).then(sendResponse);
  return true; // keep the message channel open for the async response
});
