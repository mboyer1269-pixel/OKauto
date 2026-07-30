"use client";

/** Small typed fetch wrapper for client components hitting /api/v1. */
export class ClientApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json: jsonBody, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(jsonBody !== undefined ? { "content-type": "application/json" } : {}),
      ...rest.headers,
    },
    body: jsonBody !== undefined ? JSON.stringify(jsonBody) : rest.body,
  });
  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    const err = data?.error;
    throw new ClientApiError(
      res.status,
      err?.code ?? "unknown",
      err?.message ?? `Request failed (${res.status})`,
      err?.details,
    );
  }
  return data as T;
}
