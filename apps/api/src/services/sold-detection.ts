import type { PrismaClient } from "@okauto/db";
import { formatMoney, listingStakeholders, notify, orgLeaderIds } from "../modules/notifications/service.js";
import type { NotificationHub } from "../modules/notifications/hub.js";
import { incrementCounter } from "../lib/metrics.js";

export interface SoldDetectionReport {
  sourcesScanned: number;
  vehiclesFlagged: number;
  listingsFlagged: number;
  notificationsSent: number;
}

/**
 * Sold detection: a vehicle sourced from a full-snapshot feed (CSV or JSON_FEED)
 * that was present before the source's last successful run but absent from it
 * (lastSeenAt < lastRunAt) is flagged SUSPECTED_SOLD. Its LIVE listings move to
 * NEEDS_REMOVAL and stakeholders get a realtime alert.
 *
 * WEBHOOK/MANUAL sources are excluded: pushes and manual edits carry no
 * "full inventory snapshot" semantics.
 */
export async function runSoldDetection(
  db: PrismaClient,
  hub: NotificationHub | null,
  orgId?: string,
): Promise<SoldDetectionReport> {
  const report: SoldDetectionReport = { sourcesScanned: 0, vehiclesFlagged: 0, listingsFlagged: 0, notificationsSent: 0 };

  const sources = await db.importSource.findMany({
    where: {
      status: "ACTIVE",
      type: { in: ["CSV", "JSON_FEED"] },
      lastRunAt: { not: null },
      lastStatus: { in: ["SUCCEEDED", "PARTIAL"] },
      ...(orgId ? { orgId } : {}),
    },
  });

  for (const source of sources) {
    report.sourcesScanned += 1;
    const missing = await db.vehicle.findMany({
      where: {
        orgId: source.orgId,
        sourceId: source.id,
        status: { in: ["ACTIVE", "PRICE_CHANGED"] },
        lastSeenAt: { lt: source.lastRunAt! },
      },
    });

    const org = await db.organization.findUnique({ where: { id: source.orgId } });
    const settings = (org?.settings ?? {}) as { soldDetectionEnabled?: boolean };
    if (settings.soldDetectionEnabled === false) continue;

    for (const vehicle of missing) {
      const result = await db.$transaction(async (tx) => {
        const updated = await tx.vehicle.updateMany({
          where: { id: vehicle.id, status: { in: ["ACTIVE", "PRICE_CHANGED"] } },
          data: { status: "SUSPECTED_SOLD" },
        });
        if (updated.count === 0) return { listingIds: [] as string[] };

        const liveListings = await tx.listing.findMany({
          where: { vehicleId: vehicle.id, status: "LIVE" },
        });
        const flagged: string[] = [];
        for (const listing of liveListings) {
          await tx.listing.update({
            where: { id: listing.id },
            data: { status: "NEEDS_REMOVAL" },
          });
          await tx.listingEvent.create({
            data: {
              listingId: listing.id,
              actorType: "SYSTEM",
              fromStatus: "LIVE",
              toStatus: "NEEDS_REMOVAL",
              note: "Vehicle missing from latest inventory sync — confirm sold & remove listing",
            },
          });
          flagged.push(listing.id);
        }
        return { listingIds: flagged };
      });

      report.vehiclesFlagged += 1;
      report.listingsFlagged += result.listingIds.length;
      incrementCounter("okauto_vehicles_suspected_sold_total", { org: source.orgId });

      const { userIds } = await listingStakeholders(db, vehicle.id);
      const title = `Possibly sold: ${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model}`.replace(/\s+/g, " ").trim();
      const body =
        `This vehicle (${vehicle.stockNumber ?? vehicle.vin ?? vehicle.id}) disappeared from the latest inventory sync. ` +
        `If it sold, confirm and remove its Marketplace listing to keep ads fresh.` +
        (vehicle.priceCents ? ` Last price: ${formatMoney(vehicle.priceCents, vehicle.currency)}.` : "");
      const targets = userIds.length > 0 ? userIds : await orgLeaderIds(db, source.orgId);
      for (const userId of targets) {
        await notify(db, hub, {
          orgId: source.orgId,
          userId,
          type: "SOLD_SUSPECTED",
          title,
          body,
          data: { vehicleId: vehicle.id, listingIds: result.listingIds },
        });
        report.notificationsSent += 1;
      }
    }
  }

  return report;
}
