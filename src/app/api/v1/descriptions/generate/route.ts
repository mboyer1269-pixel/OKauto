import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { authenticate, requireRole } from "@/lib/auth";
import { ApiError, assertMutationOrigin, errorResponse, json, requestId } from "@/lib/http";
import { generateDescription, vehicleInput } from "@/lib/vehicle";

export async function POST(request: NextRequest): Promise<Response> {
  const id = requestId(request);
  try {
    assertMutationOrigin(request);
    const context = await authenticate(request);
    requireRole(context, "SALESPERSON");
    const input = z.object({ vehicleId: z.uuid() }).parse(await request.json());
    const [vehicle] = await db()
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.organizationId, context.organization.id)))
      .limit(1);
    if (!vehicle) throw new ApiError(404, "VEHICLE_NOT_FOUND", "Vehicle was not found.");
    const description = await generateDescription(
      vehicleInput.parse({ ...vehicle, priceCents: Number(vehicle.priceCents), photos: [] }),
      context.organization.name,
    );
    return json({ data: description }, {}, id);
  } catch (error) {
    return errorResponse(error, id);
  }
}
