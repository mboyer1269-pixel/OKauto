import type { StoredSession } from "./types.js";

/**
 * API client for extension contexts (popup, side panel, background).
 * Tokens are kept in chrome.storage.local; a 401 triggers one
 * refresh-token rotation and retry.
 */

export const DEFAULT_API_URL = "http://localhost:4000";
const SESSION_KEY = "openlot.session";

export async function getSession(): Promise<StoredSession | null> {
  const data = await chrome.storage.local.get(SESSION_KEY);
  return (data[SESSION_KEY] as StoredSession | undefined) ?? null;
}

export async function saveSession(session: StoredSession | null): Promise<void> {
  if (session) {
    await chrome.storage.local.set({ [SESSION_KEY]: session });
  } else {
    await chrome.storage.local.remove(SESSION_KEY);
  }
}

export class ExtApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

async function refreshSession(session: StoredSession): Promise<StoredSession | null> {
  try {
    const res = await fetch(`${session.apiUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-openlot-client": "extension" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const next: StoredSession = {
      ...session,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
      orgs: data.orgs,
    };
    await saveSession(next);
    return next;
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
  retrying = false,
): Promise<T> {
  const session = await getSession();
  if (!session) throw new ExtApiError(401, "Not signed in");
  const res = await fetch(`${session.apiUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      authorization: `Bearer ${session.accessToken}`,
      "x-openlot-client": "extension",
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401 && !retrying) {
    const refreshed = await refreshSession(session);
    if (refreshed) return apiFetch<T>(path, options, true);
    await saveSession(null);
    throw new ExtApiError(401, "Session expired — sign in again");
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let details: unknown;
    try {
      const data = await res.json();
      message = data?.error?.message ?? message;
      details = data?.error?.details;
    } catch {
      /* ignore */
    }
    throw new ExtApiError(res.status, message, details);
  }
  return (await res.json()) as T;
}

export async function login(apiUrl: string, email: string, password: string): Promise<StoredSession> {
  const res = await fetch(`${apiUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-openlot-client": "extension" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    let message = "Sign-in failed";
    try {
      message = (await res.json())?.error?.message ?? message;
    } catch {
      /* ignore */
    }
    throw new ExtApiError(res.status, message);
  }
  const data = await res.json();
  const session: StoredSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: data.user,
    orgs: data.orgs,
    currentOrgId: data.orgs[0]?.orgId ?? null,
    apiUrl,
  };
  await saveSession(session);
  return session;
}

export async function logout(): Promise<void> {
  const session = await getSession();
  if (session) {
    try {
      await fetch(`${session.apiUrl}/api/v1/auth/logout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
    } catch {
      /* best effort */
    }
  }
  await saveSession(null);
}
