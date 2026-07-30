import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { auditLogs, listingEvents, listings, vehicleMedia, vehicles } from "@/db/schema";
import { verifyHandoffToken } from "@/lib/handoff";
import { ApiError, assertMutationOrigin, errorResponse, extensionCors, json, requestId } from "@/lib/http";

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("LOAD"), token: z.string().min(80).max(2_000) }),
  z.object({
    action: z.literal("PUBLISHED"),
    token: z.string().min(80).max(2_000),
    externalUrl: z.url().startsWith("https://").optional(),
  }),
]);

export function OPTIONS(request: NextRequest): NextResponse {
  return extensionCors(
    request,
    new NextResponse(null, {
      status: 204,
      headers: {
        "access-control-allow-methods": "POST,OPTIONS",
        "access-control-allow-headers": "content-type,x-request-id",
      },
    }),
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const id = requestId(request);
  try {
    assertMutationOrigin(request);
    const input = inputSchema.parse(await request.json());
    const claims = verifyHandoffToken(input.token);
    const [row] = await db()
      .select({ listing: listings, vehicle: vehicles })
      .from(listings)
      .innerJoin(vehicles, eq(vehicles.id, listings.vehicleId))
      .where(
        and(
          eq(listings.id, claims.listingId),
          eq(listings.organizationId, claims.organizationId),
          eq(vehicles.organizationId, claims.organizationId),
        ),
      )
      .limit(1);
    if (!row) throw new ApiError(404, "LISTING_NOT_FOUND", "Listing was not found.");

    if (input.action === "PUBLISHED") {
      if (row.listing.status !== "PREPARED") {
        throw new ApiError(409, "INVALID_TRANSITION", "Only a prepared listing can be confirmed as published.");
      }
      await db().transaction(async (tx) => {
        await tx
          .update(listings)
          .set({ status: "PUBLISHED", externalUrl: input.externalUrl, publishedAt: new Date(), updatedAt: new Date() })
          .where(eq(listings.id, row.listing.id));
        await tx.insert(listingEvents).values({ listingId: row.listing.id, actorId: claims.userId, type: "PUBLISHED" });
        await tx.insert(auditLogs).values({
          organizationId: claims.organizationId,
          actorId: claims.userId,
          action: "listing.published",
          entityType: "listing",
          entityId: row.listing.id,
          requestId: id,
          metadata: { source: "extension_handoff" },
        });
      });
      return extensionCors(request, json({ ok: true, status: "PUBLISHED" }, {}, id));
    }

    if (row.listing.status !== "PREPARED") {
      throw new ApiError(409, "INVALID_LISTING_STATE", "Prepare this listing again from the dashboard.");
    }
    const media = await db().select().from(vehicleMedia).where(eq(vehicleMedia.vehicleId, row.vehicle.id));
    const photos = media.filter((item) => item.status === "READY").sort((a, b) => a.position - b.position).map((item) => item.url);
    if (!photos.length) throw new ApiError(422, "PHOTOS_REQUIRED", "At least one ready vehicle photo is required.");
    return extensionCors(
      request,
      json(
        {
          data: {
            contractVersion: 1,
            listingId: row.listing.id,
            vehicleId: row.vehicle.id,
            title: row.listing.title,
            price: Math.round(Number(row.listing.priceCents) / 100),
            description: row.listing.description,
            year: row.vehicle.year,
            make: row.vehicle.make,
            model: row.vehicle.model,
            trim: row.vehicle.trim,
            mileage: row.vehicle.mileage,
            vin: row.vehicle.vin,
            photos,
            policy: { autoSubmit: false, humanConfirmationRequired: true },
            expiresAt: new Date(claims.expiresAt).toISOString(),
          },
        },
        {},
        id,
      ),
    );
  } catch (error) {
    return extensionCors(request, errorResponse(error, id));
  }
}
