import type { CapturePayload } from "@okauto/shared";

export interface ExtensionSettings {
  apiBaseUrl: string;
  token: string;
}

type BackgroundMessage =
  | { type: "GET_SETTINGS" }
  | { type: "SAVE_SETTINGS"; settings: ExtensionSettings }
  | { type: "CAPTURE_ACTIVE_TAB" }
  | { type: "FILL_ACTIVE_TAB"; payload: CapturePayload };

async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get({
    apiBaseUrl: "http://localhost:3000",
    token: ""
  });
  return {
    apiBaseUrl: String(stored.apiBaseUrl),
    token: String(stored.token)
  };
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab is available.");
  }
  return tab;
}

async function sendToActiveTab<T>(message: unknown): Promise<T> {
  const tab = await activeTab();
  return chrome.tabs.sendMessage(tab.id!, message) as Promise<T>;
}

async function postCapture(payload: CapturePayload) {
  const settings = await getSettings();
  if (!settings.token) {
    throw new Error("Add an OKauto extension token in settings before syncing captures.");
  }

  const response = await fetch(`${settings.apiBaseUrl.replace(/\/$/, "")}/api/v1/capture`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${settings.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? JSON.stringify((body as { error: unknown }).error)
        : "Capture sync failed.";
    throw new Error(message);
  }

  return body;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
  (async () => {
    if (message.type === "GET_SETTINGS") {
      return { ok: true, settings: await getSettings() };
    }

    if (message.type === "SAVE_SETTINGS") {
      await chrome.storage.sync.set(message.settings);
      return { ok: true };
    }

    if (message.type === "CAPTURE_ACTIVE_TAB") {
      const captured = await sendToActiveTab<{ ok: boolean; payload?: CapturePayload; error?: string }>({
        type: "CAPTURE_VISIBLE_VEHICLE"
      });
      if (!captured.ok || !captured.payload) {
        throw new Error(captured.error ?? "Unable to capture visible vehicle data.");
      }
      const result = await postCapture(captured.payload);
      return { ok: true, payload: captured.payload, result };
    }

    if (message.type === "FILL_ACTIVE_TAB") {
      const result = await sendToActiveTab({
        type: "FILL_MARKETPLACE_FIELDS",
        payload: message.payload
      });
      return { ok: true, result };
    }

    return { ok: false, error: "Unknown message." };
  })()
    .then(sendResponse)
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected extension error."
      })
    );

  return true;
});
