import { handler, jsonOk } from '@/lib/http';
import { clearSessionCookie } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler(async () => {
  await clearSessionCookie();
  return jsonOk({ ok: true });
});
