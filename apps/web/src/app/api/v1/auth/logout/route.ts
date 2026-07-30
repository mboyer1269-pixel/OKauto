import { NextRequest } from "next/server";
import { clearSessionCookie, destroySession } from "@/lib/auth";
import { jsonOk } from "@/lib/http";

const SESSION_COOKIE = "okauto_session";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  await clearSessionCookie();
  return jsonOk({ ok: true });
}
