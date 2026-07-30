import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { AppContext } from "../app.js";
import { listingEvents, listings, orgMemberships, users, vehicles } from "../db/schema.js";
import { requireMembership } from "../plugins/auth.js";

export function analyticsRoutes(ctx: AppContext): FastifyPluginAsync {
  const { db } = ctx;

  return async (app) => {
    /** Org-wide KPIs for the dashboard home. */
    app.get("/orgs/:orgId/analytics/overview", async (request) => {
      const { orgId } = request.params as { orgId: string };
      await requireMembership(db, request, orgId);

      const now = Date.now();
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

      const inventoryByStatus = await db
        .select({ status: vehicles.status, count: sql<number>`count(*)::int` })
        .from(vehicles)
        .where(eq(vehicles.orgId, orgId))
        .groupBy(vehicles.status);

      const [activeListings] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(listings)
        .where(and(eq(listings.orgId, orgId), eq(listings.status, "ACTIVE")));

      const [publishedLast7] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(listings)
        .where(and(eq(listings.orgId, orgId), gte(listings.publishedAt, sevenDaysAgo)));

      const [soldLast30] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(vehicles)
        .where(and(eq(vehicles.orgId, orgId), eq(vehicles.status, "SOLD"), gte(vehicles.soldDetectedAt, thirtyDaysAgo)));

      const [avgPriceRow] = await db
        .select({ avg: sql<string | null>`avg(${vehicles.priceCents})` })
        .from(vehicles)
        .where(and(eq(vehicles.orgId, orgId), eq(vehicles.status, "AVAILABLE")));

      const byStatus = Object.fromEntries(inventoryByStatus.map((r) => [r.status, Number(r.count)]));
      return {
        inventory: {
          available: byStatus.AVAILABLE ?? 0,
          pending: byStatus.PENDING ?? 0,
          sold: byStatus.SOLD ?? 0,
          archived: byStatus.ARCHIVED ?? 0,
        },
        listings: {
          active: Number(activeListings?.count ?? 0),
          publishedLast7Days: Number(publishedLast7?.count ?? 0),
        },
        soldLast30Days: Number(soldLast30?.count ?? 0),
        averageAvailablePriceCents: avgPriceRow?.avg ? Math.round(Number(avgPriceRow.avg)) : null,
      };
    });

    /** Per-salesperson activity (managers and owners). */
    app.get("/orgs/:orgId/analytics/salespeople", async (request) => {
      const { orgId } = request.params as { orgId: string };
      await requireMembership(db, request, orgId, "MANAGER");

      const now = Date.now();
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

      const members = await db
        .select({ userId: users.id, name: users.name, email: users.email, role: orgMemberships.role })
        .from(orgMemberships)
        .innerJoin(users, eq(orgMemberships.userId, users.id))
        .where(eq(orgMemberships.orgId, orgId));

      const memberIds = members.map((m) => m.userId);
      if (memberIds.length === 0) return { salespeople: [] };

      const listingAgg = await db
        .select({
          userId: listings.userId,
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${listings.status} = 'ACTIVE')::int`,
          published7: sql<number>`count(*) filter (where ${listings.publishedAt} >= ${sevenDaysAgo})::int`,
          published30: sql<number>`count(*) filter (where ${listings.publishedAt} >= ${thirtyDaysAgo})::int`,
          lastActivity: sql<string | null>`max(${listings.updatedAt})`,
        })
        .from(listings)
        .where(and(eq(listings.orgId, orgId), inArray(listings.userId, memberIds)))
        .groupBy(listings.userId);

      const aggByUser = new Map(listingAgg.map((r) => [r.userId, r]));
      return {
        salespeople: members.map((m) => {
          const agg = aggByUser.get(m.userId);
          return {
            ...m,
            totalListings: Number(agg?.total ?? 0),
            activeListings: Number(agg?.active ?? 0),
            publishedLast7Days: Number(agg?.published7 ?? 0),
            publishedLast30Days: Number(agg?.published30 ?? 0),
            lastActivityAt: agg?.lastActivity ?? null,
          };
        }),
      };
    });

    /** Daily publish counts for simple activity charts (last 30 days). */
    app.get("/orgs/:orgId/analytics/activity", async (request) => {
      const { orgId } = request.params as { orgId: string };
      await requireMembership(db, request, orgId);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const rows = await db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${listingEvents.createdAt}), 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
        })
        .from(listingEvents)
        .innerJoin(listings, eq(listingEvents.listingId, listings.id))
        .where(
          and(
            eq(listings.orgId, orgId),
            eq(listingEvents.type, "PUBLISHED"),
            gte(listingEvents.createdAt, thirtyDaysAgo),
          ),
        )
        .groupBy(sql`1`)
        .orderBy(sql`1`);
      return { days: rows.map((r) => ({ day: r.day, published: Number(r.count) })) };
    });
  };
}
