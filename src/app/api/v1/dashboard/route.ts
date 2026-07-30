import { and, count, desc, eq, isNull, or } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { inventorySources, listingEvents, listings, memberships, notifications, syncRuns, users, vehicles } from "@/db/schema";
import { authenticate } from "@/lib/auth";
import { errorResponse, json, requestId } from "@/lib/http";

export async function GET(request: NextRequest): Promise<Response> {
  const id = requestId(request);
  try {
    const context = await authenticate(request);
    const listingScope =
      context.role === "SALESPERSON"
        ? and(eq(listings.organizationId, context.organization.id), eq(listings.assigneeId, context.user.id))
        : eq(listings.organizationId, context.organization.id);

    const [vehicleCounts, listingCounts, sources, activity, team, alerts] = await Promise.all([
      db()
        .select({ status: vehicles.status, value: count() })
        .from(vehicles)
        .where(eq(vehicles.organizationId, context.organization.id))
        .groupBy(vehicles.status),
      db().select({ status: listings.status, value: count() }).from(listings).where(listingScope).groupBy(listings.status),
      db()
        .select({
          id: inventorySources.id,
          name: inventorySources.name,
          status: inventorySources.status,
          lastSuccessAt: inventorySources.lastSuccessAt,
          lastRunStatus: syncRuns.status,
          lastRunAt: syncRuns.startedAt,
        })
        .from(inventorySources)
        .leftJoin(syncRuns, eq(syncRuns.sourceId, inventorySources.id))
        .where(eq(inventorySources.organizationId, context.organization.id))
        .orderBy(desc(syncRuns.startedAt))
        .limit(10),
      db()
        .select({
          id: listingEvents.id,
          type: listingEvents.type,
          createdAt: listingEvents.createdAt,
          title: listings.title,
          actorName: users.name,
        })
        .from(listingEvents)
        .innerJoin(listings, eq(listings.id, listingEvents.listingId))
        .leftJoin(users, eq(users.id, listingEvents.actorId))
        .where(listingScope)
        .orderBy(desc(listingEvents.createdAt))
        .limit(12),
      db()
        .select({ id: users.id, name: users.name, role: memberships.role, listings: count(listings.id) })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .leftJoin(listings, and(eq(listings.assigneeId, users.id), eq(listings.organizationId, context.organization.id)))
        .where(eq(memberships.organizationId, context.organization.id))
        .groupBy(users.id, users.name, memberships.role)
        .orderBy(desc(count(listings.id))),
      db()
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.organizationId, context.organization.id),
            eq(notifications.status, "UNREAD"),
            or(eq(notifications.userId, context.user.id), isNull(notifications.userId)),
          ),
        )
        .orderBy(desc(notifications.createdAt))
        .limit(10),
    ]);

    return json(
      {
        user: context.user,
        organization: context.organization,
        role: context.role,
        vehicleCounts: Object.fromEntries(vehicleCounts.map((row) => [row.status, row.value])),
        listingCounts: Object.fromEntries(listingCounts.map((row) => [row.status, row.value])),
        sources,
        activity,
        team: context.role === "SALESPERSON" ? team.filter((member) => member.id === context.user.id) : team,
        alerts,
      },
      {},
      id,
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
