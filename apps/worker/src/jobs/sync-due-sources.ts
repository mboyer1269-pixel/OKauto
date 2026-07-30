import { fetchFeedRecords, prisma, runSourceSync } from "@lotpilot/db";
import { log } from "../log.js";

/**
 * Poll every ACTIVE feed source whose nextSyncAt is due. Each source is
 * isolated: one failing feed never blocks the others (errors are recorded on
 * the source + run and surface in Sync Health).
 */
export async function syncDueSources(): Promise<{ synced: number; failed: number }> {
  const due = await prisma.inventorySource.findMany({
    where: {
      status: { in: ["ACTIVE", "ERROR"] },
      type: { in: ["FEED_JSON", "FEED_CSV"] },
      url: { not: null },
      OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: new Date() } }],
    },
  });

  let synced = 0;
  let failed = 0;
  for (const source of due) {
    try {
      const records = await fetchFeedRecords(source);
      const outcome = await runSourceSync(prisma, source, records, { trigger: "schedule" });
      if (outcome.status === "SUCCESS") {
        synced++;
        log("info", "source synced", { sourceId: source.id, stats: { ...outcome.stats, errors: outcome.stats.errors.length } });
      } else {
        failed++;
        log("warn", "source sync failed", { sourceId: source.id, error: outcome.error });
      }
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      log("error", "source fetch failed", { sourceId: source.id, error: message });
      await prisma.inventorySource.update({
        where: { id: source.id },
        data: {
          status: "ERROR",
          lastError: message,
          nextSyncAt: new Date(Date.now() + Math.max(15, source.scheduleMinutes) * 60_000),
        },
      });
    }
  }
  return { synced, failed };
}
