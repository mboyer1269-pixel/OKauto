import { NextRequest, NextResponse } from "next/server";

const ALLOWED = new Set([
  "http://localhost:3000",
  process.env.APP_URL ?? "",
].filter(Boolean));

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = req.headers.get("origin") ?? "";
  const isExtension = origin.startsWith("chrome-extension://");
  const isAllowed = ALLOWED.has(origin) || isExtension || origin === "";

  if (req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    if (isAllowed && origin) {
      res.headers.set("Access-Control-Allow-Origin", origin);
      res.headers.set("Access-Control-Allow-Credentials", "true");
      res.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-OKauto-Org",
      );
      res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    }
    return res;
  }

  const res = NextResponse.next();
  if (isAllowed && origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
