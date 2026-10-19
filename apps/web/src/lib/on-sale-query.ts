import { prisma } from "@okauto/database";
import {
  STALE_UNSEEN_HOURS,
  onSaleListingVehicleWhere,
} from "@okauto/shared";

export async function staleUnseenVehicleIds(
  organizationId: string,
  now = new Date(),
): Promise<string[]> {
  const cutoff = new Date(now.getTime() - STALE_UNSEEN_HOURS * 3_600_000);
  // KEPT = décision humaine, hors péremption (lastSeenAt inchangé).
  // lastSyncStatus = 'success' seulement : un run "partial" laisse le stock visible.
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT v.id
    FROM vehicles v
    INNER JOIN sync_sources s ON s.id = v."syncSourceId"
    WHERE v."organizationId" = ${organizationId}
      AND v."feedAbsenceStatus" <> 'KEPT'
      AND v."lastSeenAt" IS NOT NULL
      AND v."lastSeenAt" < ${cutoff}
      AND s."isActive" = TRUE
      AND s."lastSyncStatus" = 'success'
      AND s."lastSyncAt" IS NOT NULL
      AND s."lastSyncAt" > v."lastSeenAt"
  `;
  return rows.map((row) => row.id);
}

export async function onSaleInventoryWhere(
  organizationId: string,
  now = new Date(),
) {
  const staleUnseenIds = await staleUnseenVehicleIds(organizationId, now);
  return onSaleListingVehicleWhere(staleUnseenIds);
}
