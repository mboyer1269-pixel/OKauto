import { handler, json } from "@/server/api";
import { clearSessionCookieHeader } from "@/server/session";

export const POST = handler(async () => {
  return json({ ok: true }, { headers: { "set-cookie": clearSessionCookieHeader() } });
});
