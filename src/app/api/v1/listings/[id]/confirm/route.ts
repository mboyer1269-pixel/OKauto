import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { listingEvents, listings } from "@/db/schema";
import { audit } from "@/lib/audit";
import { authenticate } from "@/lib/auth";
import { ApiError, assertMutationOrigin, errorResponse, json, requestId } from "@/lib/http";

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("PUBLISHED"), externalUrl: z.url().startsWith("https://").optional() }),
  z.object({ action: z.literal("REMOVED") }),
  z.object({ action: z.literal("FAILED"), reason: z.string().trim().min(3).max(500) }),
]);

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = requestId(request);
  try {
    assertMutationOrigin(request);
    const context = await authenticate(request);
    const input = inputSchema.parse(await request.json());
    const params = await props.params;
    const [listing] = await db()
      .select()
      .from(listings)
      .where(and(eq(listings.id, params.id), eq(listings.organizationId, context.organization.id)))
      .limit(1);
    if (!listing) throw new ApiError(404, "LISTING_NOT_FOUND", "Listing was not found.");
    if (listing.assigneeId && listing.assigneeId !== context.user.id && context.role === "SALESPERSON") {
      throw new ApiError(403, "NOT_ASSIGNED", "This listing is assigned to another salesperson.");
    }
    if (input.action === "PUBLISHED" && !["DRAFT", "PREPARED"].includes(listing.status)) {
      throw new ApiError(409, "INVALID_TRANSITION", "This listing cannot be confirmed as published.");
    }
    if (input.action === "REMOVED" && !["PUBLISHED", "REMOVAL_REQUIRED"].includes(listing.status)) {
      throw new ApiError(409, "INVALID_TRANSITION", "This listing does not require removal.");
    }

    const update =
      input.action === "PUBLISHED"
        ? { status: "PUBLISHED" as const, externalUrl: input.externalUrl, publishedAt: new Date(), failureReason: null }
        : input.action === "REMOVED"
          ? { status: "REMOVED" as const, removedAt: new Date(), failureReason: null }
          : { status: "FAILED" as const, failureReason: input.reason };
    await db().transaction(async (tx) => {
      await tx.update(listings).set({ ...update, updatedAt: new Date() }).where(eq(listings.id, listing.id));
      await tx.insert(listingEvents).values({ listingId: listing.id, actorId: context.user.id, type: input.action, metadata: "reason" in input ? { reason: input.reason } : {} });
    });
    await audit(context, request, `listing.${input.action.toLowerCase()}`, "listing", listing.id);
    return json({ ok: true, status: input.action }, {}, id);
  } catch (error) {
    return errorResponse(error, id);
  }
}
