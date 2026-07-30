'use client';

/** Tiny fetch wrapper for client components hitting the JSON API. */
export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public payload: ApiErrorShape,
  ) {
    super(payload.message);
    this.name = 'ApiClientError';
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'same-origin',
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: ApiErrorShape };
  if (!res.ok || body.error) {
    throw new ApiClientError(res.status, body.error ?? { code: 'unknown', message: 'Request failed' });
  }
  return body.data as T;
}
