import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { runInventorySync } from '../../api/src/services/sync.ts';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', base: { service: 'okauto-worker' } });
const prisma = new PrismaClient();

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const SYNC_CRON = process.env.SYNC_CRON ?? '*/15 * * * *';

async function main() {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue('inventory-sync', { connection });

  const worker = new Worker(
    'inventory-sync',
    async (job) => {
      if (job.name === 'cron-sweep' || job.data?.type === 'sweep') {
        const sources = await prisma.inventorySource.findMany({
          where: { isActive: true, type: { in: ['csv', 'xml', 'website'] } },
        });
        let enqueued = 0;
        for (const source of sources) {
          const config = source.config as { url?: string };
          if (!config.url) continue;
          const run = await prisma.syncRun.create({
            data: { sourceId: source.id, status: 'pending' },
          });
          await queue.add('sync', { sourceId: source.id, syncRunId: run.id });
          enqueued += 1;
        }
        logger.info({ enqueued }, 'cron sweep enqueued sync jobs');
        return { enqueued };
      }

      const { sourceId, syncRunId } = job.data as { sourceId: string; syncRunId?: string };
      logger.info({ jobId: job.id, sourceId }, 'processing inventory sync');
      let runId = syncRunId;
      if (!runId) {
        const run = await prisma.syncRun.create({
          data: { sourceId, status: 'pending' },
        });
        runId = run.id;
      }
      return runInventorySync(sourceId, runId);
    },
    { connection: connection.duplicate(), concurrency: 2 },
  );

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'job failed'));

  await queue.add(
    'cron-sweep',
    { type: 'sweep' },
    { repeat: { pattern: SYNC_CRON }, jobId: 'inventory-cron-sweep', removeOnComplete: 20 },
  );

  logger.info({ redis: REDIS_URL, cron: SYNC_CRON }, 'OKauto worker started');

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
