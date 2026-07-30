export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface SessionState {
  accessToken: string | null;
  orgId: string | null;
}

export interface FetchOptions {
  method?: string;
  body?: unknown;
  /** Called when a 401 is seen; should attempt a token refresh and return a new token or null. */
  onUnauthorized?: () => Promise<string | null>;
  signal?: AbortSignal;
}

const BASE = "/api/v1";

/**
 * Fetch wrapper used by the dashboard. Same-origin via Next rewrites, so the
 * refresh cookie flows without CORS; access token goes in the bearer header.
 */
export async function apiFetch<T>(session: SessionState, path: string, options: FetchOptions = {}): Promise<T> {
  const doFetch = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (session.orgId) headers["x-org-id"] = session.orgId;
    if (options.body !== undefined) headers["content-type"] = "application/json";
    return fetch(`${BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "include",
      signal: options.signal ?? null,
    });
  };

  let res = await doFetch(session.accessToken);
  if (res.status === 401 && options.onUnauthorized) {
    const fresh = await options.onUnauthorized();
    if (fresh) res = await doFetch(fresh);
  }

  if (!res.ok) {
    let shape: ApiErrorShape = { code: "UNKNOWN", message: `Request failed (${res.status})` };
    try {
      const json = (await res.json()) as { error?: ApiErrorShape };
      if (json.error) shape = json.error;
    } catch {
      // keep defaults
    }
    throw new ApiError(res.status, shape.code, shape.message, shape.details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}
