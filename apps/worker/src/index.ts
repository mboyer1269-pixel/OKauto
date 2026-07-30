import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@okauto/database';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

export const importQueue = new Queue('import', { connection });
export const syncQueue = new Queue('sync', { connection });
export const notificationQueue = new Queue('notifications', { connection });

// Import job processor
const importWorker = new Worker(
  'import',
  async (job) => {
    console.log(`Processing import job ${job.id}`, job.data);
    const { importJobId } = job.data as { importJobId: string };

    await prisma.importJob.update({
      where: { id: importJobId },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });

    // Import processing is handled inline in API for MVP
    // Worker available for async large imports
    return { processed: true };
  },
  { connection }
);

// Sync job processor - checks sync sources
const syncWorker = new Worker(
  'sync',
  async (job) => {
    const { syncSourceId } = job.data as { syncSourceId: string };
    const source = await prisma.syncSource.findUnique({ where: { id: syncSourceId } });
    if (!source || !source.isActive) return;

    try {
      const response = await fetch(source.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const vehicles = Array.isArray(data) ? data : data.vehicles ?? data.inventory ?? [];

      let successCount = 0;
      for (const v of vehicles) {
        try {
          await prisma.vehicle.upsert({
            where: {
              organizationId_vin: {
                organizationId: source.organizationId,
                vin: v.vin,
              },
            },
            create: {
              organizationId: source.organizationId,
              vin: v.vin,
              stockNumber: v.stockNumber ?? v.stock,
              year: v.year,
              make: v.make,
              model: v.model,
              trim: v.trim,
              mileage: v.mileage,
              price: v.price,
              exteriorColor: v.exteriorColor ?? v.color,
              description: v.description,
              status: 'AVAILABLE',
            },
            update: {
              price: v.price,
              mileage: v.mileage,
              status: v.status === 'sold' ? 'SOLD' : 'AVAILABLE',
            },
          });
          successCount++;
        } catch (err) {
          console.warn('Sync vehicle error:', err);
        }
      }

      await prisma.syncSource.update({
        where: { id: syncSourceId },
        data: { lastSyncAt: new Date(), lastSyncStatus: 'success', lastSyncError: null },
      });

      return { synced: successCount };
    } catch (err) {
      await prisma.syncSource.update({
        where: { id: syncSourceId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: 'error',
          lastSyncError: err instanceof Error ? err.message : 'Unknown error',
        },
      });
      throw err;
    }
  },
  { connection }
);

// Notification worker
const notificationWorker = new Worker(
  'notifications',
  async (job) => {
    const { userId, title, message, type, metadata } = job.data;
    await prisma.notification.create({
      data: { userId, title, message, type, metadata },
    });
    return { sent: true };
  },
  { connection }
);

importWorker.on('completed', (job) => console.log(`Import job ${job.id} completed`));
importWorker.on('failed', (job, err) => console.error(`Import job ${job?.id} failed:`, err));
syncWorker.on('completed', (job) => console.log(`Sync job ${job.id} completed`));
syncWorker.on('failed', (job, err) => console.error(`Sync job ${job?.id} failed:`, err));

console.log('OKauto worker started');
console.log('  - Import queue: listening');
console.log('  - Sync queue: listening');
console.log('  - Notification queue: listening');

// Schedule periodic sync checks
async function scheduleSyncJobs() {
  const sources = await prisma.syncSource.findMany({ where: { isActive: true } });
  for (const source of sources) {
    const lastSync = source.lastSyncAt?.getTime() ?? 0;
    const intervalMs = source.intervalMinutes * 60 * 1000;
    if (Date.now() - lastSync >= intervalMs) {
      await syncQueue.add('sync', { syncSourceId: source.id });
    }
  }
}

setInterval(scheduleSyncJobs, 5 * 60 * 1000);
scheduleSyncJobs().catch(console.error);

process.on('SIGTERM', async () => {
  await importWorker.close();
  await syncWorker.close();
  await notificationWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});
