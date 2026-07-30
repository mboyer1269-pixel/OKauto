import { handler, httpErrors, jsonOk } from '@/lib/http';
import { drain } from '@/lib/jobs';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Process queued jobs. Intended to be called by a scheduler (cron) or the standalone
 * worker. Protected by a shared secret header in production.
 */
export const POST = handler(async (req) => {
  if (env.isProduction) {
    const secret = req.headers.get('x-worker-secret');
    if (!secret || secret !== env.authSecret) throw httpErrors.unauthorized('Invalid worker secret');
  }
  const processed = await drain(50);
  return jsonOk({ processed });
});
