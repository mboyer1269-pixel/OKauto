import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { listingUpdateSchema } from "@okauto/shared";
import { authenticateRequest } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { handleRouteError, jsonError, jsonOk } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) return jsonError(auth.error, auth.status);
    const { id } = await ctx.params;
    const body = listingUpdateSchema.parse(await req.json());

    const listing = await db.listing.findFirst({
      where: { id, orgId: auth.org.id },
    });
    if (!listing) return jsonError("Listing not found", 404);

    const isOwner = listing.userId === auth.user.id;
    const isManager =
      auth.membership.role === "OWNER" ||
      auth.membership.role === "ADMIN" ||
      auth.membership.role === "MANAGER";
    if (!isOwner && !isManager) {
      return jsonError("Cannot update another salesperson listing", 403);
    }

    const updated = await db.listing.update({
      where: { id },
      data: {
        status: body.status,
        externalUrl: body.externalUrl === undefined ? undefined : body.externalUrl,
        title: body.title,
        description: body.description,
        priceCents: body.priceCents,
        failureReason: body.failureReason === undefined ? undefined : body.failureReason,
        postedAt: body.status === "PUBLISHED" ? new Date() : undefined,
        removedAt:
          body.status === "REMOVED" ? new Date() : undefined,
      },
    });

    await db.listingEvent.create({
      data: {
        listingId: id,
        actorId: auth.user.id,
        type: body.status ? `STATUS_${body.status}` : "UPDATED",
        payload: body,
      },
    });

    await writeAudit(auth, "LISTING_UPDATED", "Listing", id, body);

    return jsonOk({ listing: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) return jsonError(auth.error, auth.status);
    const { id } = await ctx.params;
    const listing = await db.listing.findFirst({
      where: { id, orgId: auth.org.id },
      include: {
        vehicle: { include: { media: { orderBy: { sortOrder: "asc" } } } },
        events: { orderBy: { createdAt: "desc" } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!listing) return jsonError("Listing not found", 404);
    return jsonOk({ listing });
  } catch (err) {
    return handleRouteError(err);
  }
}
