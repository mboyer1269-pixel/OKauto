import type { NextRequest, NextResponse } from "next/server";

import { authenticate, logout, SESSION_COOKIE } from "@/lib/auth";
import { assertMutationOrigin, errorResponse, json, requestId } from "@/lib/http";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const id = requestId(request);
  try {
    assertMutationOrigin(request);
    await logout(await authenticate(request));
    const response = json({ ok: true }, {}, id);
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return errorResponse(error, id);
  }
}
