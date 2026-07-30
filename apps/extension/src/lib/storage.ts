export interface ExtensionSettings {
  apiUrl: string;
  pat: string;
  /** Remote adapter config override (selector strategies as data). */
  adapterConfig?: unknown;
}

const DEFAULTS: ExtensionSettings = {
  apiUrl: "http://localhost:4000",
  pat: "",
};

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(["apiUrl", "pat", "adapterConfig"]);
  return {
    apiUrl: typeof stored.apiUrl === "string" && stored.apiUrl ? stored.apiUrl : DEFAULTS.apiUrl,
    pat: typeof stored.pat === "string" ? stored.pat : "",
    adapterConfig: stored.adapterConfig,
  };
}

export async function saveSettings(patch: Partial<ExtensionSettings>): Promise<void> {
  await chrome.storage.local.set(patch);
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(["pat"]);
}
