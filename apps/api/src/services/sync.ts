import { prisma } from '../db.js';
import {
  parseCsvInventory,
  parseXmlInventory,
  parseWebsiteInventory,
  upsertImportedVehicles,
} from './inventory.js';

export async function runInventorySync(sourceId: string, syncRunId: string) {
  const source = await prisma.inventorySource.findUniqueOrThrow({ where: { id: sourceId } });
  await prisma.syncRun.update({
    where: { id: syncRunId },
    data: { status: 'running', startedAt: new Date() },
  });

  try {
    const config = source.config as {
      url?: string;
      mapping?: Record<string, string>;
      headers?: Record<string, string>;
    };
    if (!config.url && source.type !== 'manual') {
      throw new Error('Source URL required for sync');
    }

    let items = [] as ReturnType<typeof parseCsvInventory>;
    if (source.type === 'csv' && config.url) {
      const res = await fetch(config.url, { headers: config.headers });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      items = parseCsvInventory(await res.text(), config.mapping);
    } else if (source.type === 'xml' && config.url) {
      const res = await fetch(config.url, { headers: config.headers });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      items = parseXmlInventory(await res.text(), config.mapping);
    } else if (source.type === 'website' && config.url) {
      const res = await fetch(config.url, {
        headers: {
          'User-Agent': 'OKautoInventoryBot/0.1 (+https://okauto.local; dealership-sync)',
          ...(config.headers ?? {}),
        },
      });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      items = parseWebsiteInventory(await res.text(), config.url);
    } else {
      throw new Error(`Unsupported sync for type ${source.type}`);
    }

    const stats = await upsertImportedVehicles({
      dealershipId: source.dealershipId,
      sourceId: source.id,
      items,
    });

    await prisma.syncRun.update({
      where: { id: syncRunId },
      data: { status: 'succeeded', finishedAt: new Date(), stats },
    });
    await prisma.inventorySource.update({
      where: { id: sourceId },
      data: { lastSyncAt: new Date(), lastStatus: 'succeeded' },
    });
    return stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    await prisma.syncRun.update({
      where: { id: syncRunId },
      data: { status: 'failed', finishedAt: new Date(), error: message },
    });
    await prisma.inventorySource.update({
      where: { id: sourceId },
      data: { lastStatus: 'failed' },
    });
    throw err;
  }
}
