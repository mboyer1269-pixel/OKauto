/** Typed wrapper around chrome.storage.local for extension configuration. */

export interface OkautoConfig {
  apiUrl: string;
  token: string;
  organizationId: string;
  organizationName?: string;
}

const KEY = 'okauto.config';

export async function getConfig(): Promise<OkautoConfig | null> {
  const result = await chrome.storage.local.get(KEY);
  return (result[KEY] as OkautoConfig | undefined) ?? null;
}

export async function setConfig(config: OkautoConfig): Promise<void> {
  await chrome.storage.local.set({ [KEY]: config });
}

export async function clearConfig(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
