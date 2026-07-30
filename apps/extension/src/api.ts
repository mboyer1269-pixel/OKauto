export type StoredConfig = {
  apiUrl: string;
  token: string;
};

const DEFAULTS: StoredConfig = {
  apiUrl: 'http://localhost:4000',
  token: '',
};

export async function getConfig(): Promise<StoredConfig> {
  const data = await chrome.storage.sync.get(['apiUrl', 'token']);
  return {
    apiUrl: (data.apiUrl as string) || DEFAULTS.apiUrl,
    token: (data.token as string) || '',
  };
}

export async function setConfig(partial: Partial<StoredConfig>) {
  await chrome.storage.sync.set(partial);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = await getConfig();
  if (!cfg.token) throw new Error('Extension token not configured. Open Options.');
  const res = await fetch(`${cfg.apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.token}`,
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
  }
  return data as T;
}
