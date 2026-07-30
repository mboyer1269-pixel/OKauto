"use client";

/**
 * Minimal API client for the OpenLot dashboard.
 *
 * Access tokens live in memory only; the refresh token is an httpOnly cookie
 * scoped to /api/v1/auth, so a page reload transparently re-authenticates via
 * POST /auth/refresh. 401 responses trigger a single refresh-and-retry.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        if (!res.ok) return false;
        const data = await res.json();
        accessToken = data.accessToken;
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; retry?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, retry = true } = options;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return api<T>(path, { method, body, retry: false });
  }

  if (!res.ok) {
    let code = "REQUEST_FAILED";
    let message = `Request failed (${res.status})`;
    let details: unknown;
    try {
      const data = await res.json();
      code = data?.error?.code ?? code;
      message = data?.error?.message ?? message;
      details = data?.error?.details;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiClientError(res.status, code, message, details);
  }
  return (await res.json()) as T;
}

/** Bootstrap the session from the refresh cookie (page load). */
export async function bootstrapSession(): Promise<SessionInfo | null> {
  const ok = await tryRefresh();
  if (!ok) return null;
  try {
    return await api<SessionInfo>("/api/v1/auth/me");
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
}

export interface SessionOrg {
  orgId: string;
  name: string;
  slug: string;
  role: "OWNER" | "MANAGER" | "SALESPERSON";
}

export interface SessionInfo {
  user: SessionUser;
  orgs: SessionOrg[];
}

export async function login(email: string, password: string): Promise<SessionInfo> {
  const data = await api<SessionInfo & { accessToken: string }>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  setAccessToken(data.accessToken);
  return { user: data.user, orgs: data.orgs };
}

export async function register(name: string, email: string, password: string): Promise<SessionInfo> {
  const data = await api<SessionInfo & { accessToken: string }>("/api/v1/auth/register", {
    method: "POST",
    body: { name, email, password },
  });
  setAccessToken(data.accessToken);
  return { user: data.user, orgs: data.orgs ?? [] };
}

export async function logout(): Promise<void> {
  try {
    await api("/api/v1/auth/logout", { method: "POST", body: {} });
  } finally {
    setAccessToken(null);
  }
}

export function formatPrice(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
