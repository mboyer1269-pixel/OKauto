/** Standalone background worker loop. Run with `pnpm --filter @okauto/web worker`. */
import { env } from '../lib/env';
import { logger } from '../lib/logger';
import { drain } from '../lib/jobs';

let running = true;

async function loop(): Promise<void> {
  logger.info('Worker started', { pollIntervalMs: env.workerPollIntervalMs });
  while (running) {
    try {
      const processed = await drain(25);
      if (processed === 0) {
        await new Promise((r) => setTimeout(r, env.workerPollIntervalMs));
      }
    } catch (error) {
      logger.error('Worker loop error', { error: String(error) });
      await new Promise((r) => setTimeout(r, env.workerPollIntervalMs));
    }
  }
}

process.on('SIGINT', () => {
  logger.info('Worker stopping (SIGINT)');
  running = false;
});
process.on('SIGTERM', () => {
  logger.info('Worker stopping (SIGTERM)');
  running = false;
});

void loop();
