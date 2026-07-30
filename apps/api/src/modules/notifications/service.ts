import type { NotificationType, Prisma, PrismaClient } from "@okauto/db";
import type { NotificationHub } from "./hub.js";

type Db = PrismaClient | Prisma.TransactionClient;

export interface NotifyInput {
  orgId: string;
  userId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

export async function notify(db: Db, hub: NotificationHub | null, input: NotifyInput) {
  const notification = await db.notification.create({
    data: {
      orgId: input.orgId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? undefined,
    },
  });
  hub?.publish(notification);
  return notification;
}

/** Users tied to a vehicle's active listings (assignees + creators), for alerts. */
export async function listingStakeholders(
  db: Db,
  vehicleId: string,
): Promise<{ userIds: string[]; listingIds: string[] }> {
  const listings = await db.listing.findMany({
    where: {
      vehicleId,
      status: { in: ["QUEUED", "ASSIGNED", "IN_PROGRESS", "LIVE", "ATTENTION", "NEEDS_REMOVAL"] },
    },
    select: { id: true, assigneeId: true, createdById: true },
  });
  const userIds = new Set<string>();
  for (const l of listings) {
    if (l.assigneeId) userIds.add(l.assigneeId);
    if (l.createdById) userIds.add(l.createdById);
  }
  return { userIds: [...userIds], listingIds: listings.map((l) => l.id) };
}

/** Active owners + managers of an org — fallback recipients for alerts with no assignee. */
export async function orgLeaderIds(db: Db, orgId: string): Promise<string[]> {
  const leaders = await db.membership.findMany({
    where: { orgId, status: "ACTIVE", role: { in: ["ORG_OWNER", "ORG_MANAGER"] } },
    select: { userId: true },
  });
  return leaders.map((l) => l.userId);
}

/**
 * Notify a specific user, falling back to org leaders when userId is null.
 * Every stored notification is user-bound so read-tracking stays correct.
 */
export async function notifyUserOrLeaders(
  db: Db,
  hub: NotificationHub | null,
  input: Omit<NotifyInput, "userId"> & { userId?: string | null },
): Promise<void> {
  const targets = input.userId ? [input.userId] : await orgLeaderIds(db, input.orgId);
  for (const userId of targets) {
    await notify(db, hub, { ...input, userId });
  }
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}
