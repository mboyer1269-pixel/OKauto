import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { env } from "@/lib/env";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function requestId(request: Request): string {
  return request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
}

export function json(data: unknown, init: ResponseInit = {}, id?: string): NextResponse {
  const response = NextResponse.json(data, init);
  if (id) response.headers.set("x-request-id", id);
  response.headers.set("cache-control", "no-store");
  return response;
}

export function errorResponse(error: unknown, id: string): NextResponse {
  if (error instanceof ApiError) {
    return json({ error: { code: error.code, message: error.message, details: error.details }, requestId: id }, { status: error.status }, id);
  }
  if (error instanceof ZodError) {
    return json(
      { error: { code: "VALIDATION_ERROR", message: "The request was invalid.", details: error.flatten() }, requestId: id },
      { status: 400 },
      id,
    );
  }
  console.error(JSON.stringify({ level: "error", requestId: id, message: "Unhandled API error", error: String(error) }));
  return json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." }, requestId: id }, { status: 500 }, id);
}

export function assertMutationOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const allowed = new Set([
    new URL(env().APP_URL).origin,
    ...env()
      .EXTENSION_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ]);
  if (!allowed.has(origin)) throw new ApiError(403, "ORIGIN_DENIED", "Request origin is not allowed.");
}

export function extensionCors(request: Request, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin");
  if (
    origin &&
    env()
      .EXTENSION_ORIGINS.split(",")
      .map((value) => value.trim())
      .includes(origin)
  ) {
    response.headers.set("access-control-allow-origin", origin);
    response.headers.set("access-control-allow-credentials", "true");
    response.headers.set("vary", "Origin");
  }
  return response;
}
