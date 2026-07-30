import { NextResponse, type NextRequest } from "next/server";

/**
 * CORS for extension endpoints only. These are authenticated with bearer
 * tokens (never cookies), so a permissive origin does not enable CSRF.
 */
export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/v1/ext/")) return NextResponse.next();

  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
  };
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: "/api/v1/ext/:path*",
};
