import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { authenticateRequest } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/http";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, "MANAGER");
    if ("error" in auth) return jsonError(auth.error, auth.status);

    const orgId = auth.org.id;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      available,
      sold,
      published,
      needsRemoval,
      listingsLast30,
      byUser,
      sources,
      recentJobs,
      unreadNotifications,
    ] = await Promise.all([
      db.vehicle.count({ where: { orgId, status: "AVAILABLE" } }),
      db.vehicle.count({ where: { orgId, status: "SOLD" } }),
      db.listing.count({ where: { orgId, status: "PUBLISHED" } }),
      db.listing.count({ where: { orgId, status: "NEEDS_REMOVAL" } }),
      db.listing.count({
        where: { orgId, createdAt: { gte: since } },
      }),
      db.listing.groupBy({
        by: ["userId"],
        where: { orgId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      db.inventorySource.findMany({
        where: { orgId },
        select: {
          id: true,
          name: true,
          type: true,
          health: true,
          lastSyncAt: true,
          lastError: true,
        },
      }),
      db.jobRun.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.notification.count({
        where: { orgId, userId: auth.user.id, readAt: null },
      }),
    ]);

    const users = await db.user.findMany({
      where: { id: { in: byUser.map((u) => u.userId) } },
      select: { id: true, name: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return jsonOk({
      kpis: {
        availableInventory: available,
        soldInventory: sold,
        publishedListings: published,
        needsRemoval,
        listingsLast30Days: listingsLast30,
        unreadNotifications,
      },
      salespersonActivity: byUser.map((row) => ({
        userId: row.userId,
        name: userMap.get(row.userId)?.name ?? "Unknown",
        email: userMap.get(row.userId)?.email ?? "",
        listings: row._count._all,
      })),
      syncHealth: sources,
      recentJobs,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
