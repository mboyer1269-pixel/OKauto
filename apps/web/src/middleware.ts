import { NextRequest, NextResponse } from "next/server";

const CHROME_EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
const ALLOWED_WEB_ORIGINS = new Set([
  "https://suivia.ca",
  "https://www.suivia.ca",
  "http://localhost:3000",
]);

function allowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  return CHROME_EXTENSION_ORIGIN.test(origin) || ALLOWED_WEB_ORIGINS.has(origin)
    ? origin
    : null;
}

function applyExtensionCors(response: NextResponse, origin: string | null) {
  if (!origin) return response;

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, X-API-Key",
  );
  response.headers.set("Access-Control-Max-Age", "86400");
  response.headers.set("Vary", "Origin");
  return response;
}

export function middleware(request: NextRequest) {
  const origin = allowedOrigin(request);

  if (request.method === "OPTIONS") {
    return applyExtensionCors(
      new NextResponse(null, { status: 204 }),
      origin,
    );
  }

  return applyExtensionCors(NextResponse.next(), origin);
}

export const config = {
  matcher: "/api/v1/extension/:path*",
};
