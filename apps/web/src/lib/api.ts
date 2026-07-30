const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type ApiError = { error: { code: string; message: string; details?: unknown } };

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as T | ApiError;
  if (!res.ok) {
    const err = data as ApiError;
    throw new Error(err.error?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export { API_URL };
