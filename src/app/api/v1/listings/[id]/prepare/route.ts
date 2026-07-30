import { and, eq } from "drizzle-orm";
import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { listingEvents, listings, vehicleMedia, vehicles } from "@/db/schema";
import { audit } from "@/lib/audit";
import { authenticate } from "@/lib/auth";
import { createHandoffToken } from "@/lib/handoff";
import { ApiError, assertMutationOrigin, errorResponse, extensionCors, json, requestId } from "@/lib/http";

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

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const id = requestId(request);
  try {
    assertMutationOrigin(request);
    const context = await authenticate(request);
    const params = await props.params;
    const [row] = await db()
      .select({ listing: listings, vehicle: vehicles })
      .from(listings)
      .innerJoin(vehicles, eq(vehicles.id, listings.vehicleId))
      .where(and(eq(listings.id, params.id), eq(listings.organizationId, context.organization.id)))
      .limit(1);
    if (!row) throw new ApiError(404, "LISTING_NOT_FOUND", "Listing was not found.");
    if (row.listing.assigneeId && row.listing.assigneeId !== context.user.id && context.role === "SALESPERSON") {
      throw new ApiError(403, "NOT_ASSIGNED", "This listing is assigned to another salesperson.");
    }
    if (!["DRAFT", "PREPARED"].includes(row.listing.status)) {
      throw new ApiError(409, "INVALID_LISTING_STATE", "Only draft or prepared listings can be opened.");
    }
    const media = await db().select().from(vehicleMedia).where(eq(vehicleMedia.vehicleId, row.vehicle.id));
    if (!media.some((item) => item.status === "READY")) {
      throw new ApiError(422, "PHOTOS_REQUIRED", "At least one ready vehicle photo is required.");
    }
    await db().transaction(async (tx) => {
      await tx.update(listings).set({ status: "PREPARED", preparedAt: new Date(), updatedAt: new Date() }).where(eq(listings.id, row.listing.id));
      await tx.insert(listingEvents).values({ listingId: row.listing.id, actorId: context.user.id, type: "PREPARED" });
    });
    await audit(context, request, "listing.prepared", "listing", row.listing.id);
    return extensionCors(
      request,
      json(
        {
          data: {
            contractVersion: 1,
            handoffToken: createHandoffToken({
              listingId: row.listing.id,
              organizationId: context.organization.id,
              userId: context.user.id,
            }),
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
            photos: media.filter((item) => item.status === "READY").sort((a, b) => a.position - b.position).map((item) => item.url),
            policy: { autoSubmit: false, humanConfirmationRequired: true },
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
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
