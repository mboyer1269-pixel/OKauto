import { and, desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { listings, users, vehicles } from "@/db/schema";
import { audit } from "@/lib/audit";
import { authenticate, requireRole } from "@/lib/auth";
import { ApiError, assertMutationOrigin, errorResponse, json, requestId } from "@/lib/http";
import { generateDescription, listingTitle, vehicleInput } from "@/lib/vehicle";

const createSchema = z.object({
  vehicleId: z.uuid(),
  assigneeId: z.uuid().optional(),
  channel: z.literal("FACEBOOK_MARKETPLACE").default("FACEBOOK_MARKETPLACE"),
  externalAccountKey: z.string().trim().min(1).max(120).default("default"),
  description: z.string().trim().min(20).max(5_000).optional(),
});

export async function GET(request: NextRequest): Promise<Response> {
  const id = requestId(request);
  try {
    const context = await authenticate(request);
    const rows = await db()
      .select({
        id: listings.id,
        status: listings.status,
        title: listings.title,
        priceCents: listings.priceCents,
        channel: listings.channel,
        externalUrl: listings.externalUrl,
        failureReason: listings.failureReason,
        createdAt: listings.createdAt,
        updatedAt: listings.updatedAt,
        vehicleId: vehicles.id,
        vin: vehicles.vin,
        stockNumber: vehicles.stockNumber,
        assigneeName: users.name,
      })
      .from(listings)
      .innerJoin(vehicles, eq(vehicles.id, listings.vehicleId))
      .leftJoin(users, eq(users.id, listings.assigneeId))
      .where(eq(listings.organizationId, context.organization.id))
      .orderBy(desc(listings.updatedAt))
      .limit(100);
    return json({ data: rows.map((row) => ({ ...row, priceCents: Number(row.priceCents) })) }, {}, id);
  } catch (error) {
    return errorResponse(error, id);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const id = requestId(request);
  try {
    assertMutationOrigin(request);
    const context = await authenticate(request);
    requireRole(context, "SALESPERSON");
    const input = createSchema.parse(await request.json());
    const [vehicle] = await db()
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.organizationId, context.organization.id)))
      .limit(1);
    if (!vehicle) throw new ApiError(404, "VEHICLE_NOT_FOUND", "Vehicle was not found.");
    if (vehicle.status !== "AVAILABLE") throw new ApiError(409, "VEHICLE_UNAVAILABLE", "Only available vehicles can be listed.");

    const parsed = vehicleInput.parse({
      ...vehicle,
      priceCents: Number(vehicle.priceCents),
      photos: [],
    });
    const generated = input.description
      ? { text: input.description, provider: "user" as const }
      : await generateDescription(parsed, context.organization.name);
    try {
      const [created] = await db()
        .insert(listings)
        .values({
          organizationId: context.organization.id,
          vehicleId: vehicle.id,
          assigneeId: input.assigneeId ?? context.user.id,
          channel: input.channel,
          externalAccountKey: input.externalAccountKey,
          title: listingTitle(parsed),
          priceCents: Number(vehicle.priceCents),
          description: generated.text,
        })
        .returning();
      if (!created) throw new ApiError(500, "LISTING_CREATE_FAILED", "Could not create a listing draft.");
      await audit(context, request, "listing.created", "listing", created.id, { vehicleId: vehicle.id, descriptionProvider: generated.provider });
      return json({ data: { ...created, priceCents: Number(created.priceCents) } }, { status: 201 }, id);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        throw new ApiError(409, "DUPLICATE_LISTING", "An active listing already exists for this vehicle and account.");
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error, id);
  }
}
