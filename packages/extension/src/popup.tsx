import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { buildListingTitle, type CapturePayload } from "@okauto/shared";
import "./extension.css";

interface Settings {
  apiBaseUrl: string;
  token: string;
}

interface MessageResponse {
  ok: boolean;
  error?: string;
  settings?: Settings;
  payload?: CapturePayload;
  result?: unknown;
}

function sendMessage(message: unknown): Promise<MessageResponse> {
  return chrome.runtime.sendMessage(message);
}

function Popup() {
  const [settings, setSettings] = useState<Settings>({ apiBaseUrl: "http://localhost:3000", token: "" });
  const [status, setStatus] = useState<string>("Ready to capture a visible dealer vehicle page.");
  const [error, setError] = useState<string>("");
  const [lastPayload, setLastPayload] = useState<CapturePayload | null>(null);

  useEffect(() => {
    sendMessage({ type: "GET_SETTINGS" }).then((response) => {
      if (response.ok && response.settings) {
        setSettings(response.settings);
      }
    });
  }, []);

  async function saveSettings() {
    setError("");
    const response = await sendMessage({ type: "SAVE_SETTINGS", settings });
    if (response.ok) {
      setStatus("Settings saved.");
    } else {
      setError(response.error ?? "Unable to save settings.");
    }
  }

  async function capture() {
    setError("");
    setStatus("Capturing visible vehicle data...");
    const response = await sendMessage({ type: "CAPTURE_ACTIVE_TAB" });
    if (!response.ok || !response.payload) {
      setError(response.error ?? "Capture failed.");
      return;
    }
    setLastPayload(response.payload);
    setStatus(`${buildListingTitle(response.payload.vehicle)} synced to OKauto for review.`);
  }

  async function fillFields() {
    if (!lastPayload) {
      setError("Capture a vehicle before preparing marketplace fields.");
      return;
    }
    const response = await sendMessage({ type: "FILL_ACTIVE_TAB", payload: lastPayload });
    if (!response.ok) {
      setError(response.error ?? "Unable to fill visible fields.");
      return;
    }
    setStatus("Visible fields prepared. Review every value before posting.");
  }

  return (
    <main className="popup">
      <section className="card">
        <h1>OKauto Capture</h1>
        <p>Capture visible vehicle details and sync them to your dealership dashboard for review.</p>
        <div className="field">
          <label htmlFor="apiBaseUrl">API base URL</label>
          <input
            id="apiBaseUrl"
            value={settings.apiBaseUrl}
            onChange={(event) => setSettings((current) => ({ ...current, apiBaseUrl: event.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="token">Extension token</label>
          <input
            id="token"
            type="password"
            value={settings.token}
            onChange={(event) => setSettings((current) => ({ ...current, token: event.target.value }))}
          />
        </div>
        <button type="button" className="secondary" onClick={saveSettings}>
          Save settings
        </button>
        <button type="button" onClick={capture}>
          Capture active tab
        </button>
        <button type="button" className="secondary" onClick={fillFields}>
          Prepare visible marketplace fields
        </button>
        <div className={`status ${error ? "error" : ""}`} role="status">
          {error || status}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);
