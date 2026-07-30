import { NextResponse } from "next/server";

export function jsonError(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function requestId(headers: Headers): string {
  return headers.get("x-request-id") ?? crypto.randomUUID();
}
