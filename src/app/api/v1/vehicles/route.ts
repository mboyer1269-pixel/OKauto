import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { vehicleMedia, vehicles } from "@/db/schema";
import { authenticate } from "@/lib/auth";
import { errorResponse, json, requestId } from "@/lib/http";

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["AVAILABLE", "STALE", "SOLD", "ARCHIVED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: NextRequest): Promise<Response> {
  const id = requestId(request);
  try {
    const context = await authenticate(request);
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const conditions = [eq(vehicles.organizationId, context.organization.id)];
    if (query.status) conditions.push(eq(vehicles.status, query.status));
    if (query.q) {
      conditions.push(
        or(
          ilike(vehicles.vin, `%${query.q}%`),
          ilike(vehicles.stockNumber, `%${query.q}%`),
          ilike(vehicles.make, `%${query.q}%`),
          ilike(vehicles.model, `%${query.q}%`),
        )!,
      );
    }
    const rows = await db().select().from(vehicles).where(and(...conditions)).orderBy(desc(vehicles.updatedAt)).limit(query.limit);
    const media = rows.length
      ? await db()
          .select()
          .from(vehicleMedia)
          .where(inArray(vehicleMedia.vehicleId, rows.map((row) => row.id)))
      : [];
    const byVehicle = new Map<string, typeof media>();
    for (const item of media) byVehicle.set(item.vehicleId, [...(byVehicle.get(item.vehicleId) ?? []), item]);
    return json(
      {
        data: rows.map((vehicle) => ({
          ...vehicle,
          priceCents: Number(vehicle.priceCents),
          media: (byVehicle.get(vehicle.id) ?? []).sort((a, b) => a.position - b.position),
        })),
      },
      {},
      id,
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
