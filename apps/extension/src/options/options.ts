import { OkAutoApiClient } from "../lib/api-client.js";
import { getSettings, saveSettings } from "../lib/storage.js";

const $ = <T extends HTMLElement>(selector: string): T => document.querySelector(selector) as T;

async function init(): Promise<void> {
  const settings = await getSettings();
  ($("#api-url") as HTMLInputElement).value = settings.apiUrl;
  ($("#pat") as HTMLInputElement).value = settings.pat;
  ($("#adapter-config") as HTMLTextAreaElement).value = settings.adapterConfig
    ? JSON.stringify(settings.adapterConfig, null, 2)
    : "";
}

function setResult(message: string, ok: boolean): void {
  const el = $("#result");
  el.textContent = message;
  el.className = ok ? "ok" : "err";
}

$("#save").addEventListener("click", async () => {
  const apiUrl = ($("#api-url") as HTMLInputElement).value.trim();
  const pat = ($("#pat") as HTMLInputElement).value.trim();
  await saveSettings({ apiUrl, pat });
  setResult("Saved.", true);
});

$("#test").addEventListener("click", async () => {
  const apiUrl = ($("#api-url") as HTMLInputElement).value.trim();
  const pat = ($("#pat") as HTMLInputElement).value.trim();
  setResult("Testing…", true);
  try {
    const client = new OkAutoApiClient(apiUrl, pat);
    const ping = await client.ping();
    setResult(`Connected to ${ping.org.name} as ${ping.user.name} (${ping.role}).`, true);
  } catch (err) {
    setResult(err instanceof Error ? err.message : "Connection failed", false);
  }
});

$("#save-adapter").addEventListener("click", async () => {
  const raw = ($("#adapter-config") as HTMLTextAreaElement).value.trim();
  if (!raw) {
    await saveSettings({ adapterConfig: undefined });
    setResult("Adapter override cleared.", true);
    return;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    await saveSettings({ adapterConfig: parsed });
    setResult("Adapter override saved.", true);
  } catch {
    setResult("Invalid JSON — override not saved.", false);
  }
});

$("#clear-adapter").addEventListener("click", async () => {
  ($("#adapter-config") as HTMLTextAreaElement).value = "";
  await saveSettings({ adapterConfig: undefined });
});

void init();
