import { getSessionFromRequest, hasAnyRole } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@okauto/db";
import { VehicleInputSchema, canonicalizeUrl, normalizeVehicle, vehicleIdentityKey } from "@okauto/shared";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const ImportPayloadSchema = z.object({
  dealershipId: z.string().uuid().optional(),
  sourceName: z.string().trim().min(1).max(120).default("Manual import"),
  sourceUrl: z.string().url().optional(),
  rows: z.array(VehicleInputSchema.extend({ sourceUrl: z.string().url().optional() })).min(1).max(500)
});

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return jsonError("UNAUTHORIZED", "Sign in to import inventory.", 401);
  }

  if (!hasAnyRole(session, ["OWNER", "MANAGER"])) {
    return jsonError("FORBIDDEN", "Only owners and managers can import inventory.", 403);
  }

  const payload = ImportPayloadSchema.safeParse(await request.json());
  if (!payload.success) {
    return jsonError("INVALID_IMPORT_PAYLOAD", payload.error.issues.map((issue) => issue.message).join("; "), 422);
  }

  const dealership =
    (payload.data.dealershipId
      ? await prisma.dealership.findFirst({
          where: { id: payload.data.dealershipId, organizationId: session.organizationId }
        })
      : await prisma.dealership.findFirst({ where: { organizationId: session.organizationId } })) ?? null;

  if (!dealership) {
    return jsonError("NO_DEALERSHIP", "Create a dealership before importing inventory.", 409);
  }

  const source = await prisma.inventorySource.create({
    data: {
      organizationId: session.organizationId,
      dealershipId: dealership.id,
      type: "CSV",
      name: payload.data.sourceName,
      url: payload.data.sourceUrl
    }
  });

  const syncRun = await prisma.sourceSyncRun.create({
    data: {
      sourceId: source.id,
      status: "RUNNING",
      recordsSeen: payload.data.rows.length
    }
  });

  let upserted = 0;
  let skipped = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (const [index, row] of payload.data.rows.entries()) {
    try {
      const vehicle = normalizeVehicle(row);
      const sourceUrl = row.sourceUrl ? canonicalizeUrl(row.sourceUrl) : undefined;
      const existing = vehicle.vin
        ? await prisma.vehicle.findFirst({ where: { organizationId: session.organizationId, vin: vehicle.vin } })
        : sourceUrl
          ? await prisma.vehicle.findFirst({ where: { organizationId: session.organizationId, sourceUrl } })
          : null;

      const saved = existing
        ? await prisma.vehicle.update({
            where: { id: existing.id },
            data: {
              sourceId: source.id,
              price: vehicle.price,
              mileage: vehicle.mileage,
              status: vehicle.status,
              notes: vehicle.notes,
              sourceUrl
            }
          })
        : await prisma.vehicle.create({
            data: {
              organizationId: session.organizationId,
              dealershipId: dealership.id,
              sourceId: source.id,
              vin: vehicle.vin,
              stockNumber: vehicle.stockNumber,
              year: vehicle.year,
              make: vehicle.make,
              model: vehicle.model,
              trim: vehicle.trim,
              bodyStyle: vehicle.bodyStyle,
              drivetrain: vehicle.drivetrain,
              transmission: vehicle.transmission,
              fuelType: vehicle.fuelType,
              exteriorColor: vehicle.exteriorColor,
              interiorColor: vehicle.interiorColor,
              mileage: vehicle.mileage,
              price: vehicle.price,
              status: vehicle.status,
              location: vehicle.location,
              features: vehicle.features,
              notes: vehicle.notes,
              identityKey: vehicleIdentityKey(vehicle),
              sourceUrl
            }
          });

      if (existing?.price !== undefined && vehicle.price !== undefined && existing.price !== vehicle.price) {
        const listing = await prisma.listing.findFirst({ where: { vehicleId: saved.id }, orderBy: { updatedAt: "desc" } });
        await prisma.notification.create({
          data: {
            organizationId: session.organizationId,
            vehicleId: saved.id,
            listingId: listing?.id,
            type: "PRICE_CHANGE",
            title: `${vehicle.make} ${vehicle.model} price changed`,
            message: `${vehicle.stockNumber ?? saved.id} changed from $${existing.price.toLocaleString()} to $${vehicle.price.toLocaleString()}.`,
            severity: "warning"
          }
        });
      }

      if (existing?.status !== "SOLD" && vehicle.status === "SOLD") {
        const listing = await prisma.listing.findFirst({ where: { vehicleId: saved.id }, orderBy: { updatedAt: "desc" } });
        await prisma.notification.create({
          data: {
            organizationId: session.organizationId,
            vehicleId: saved.id,
            listingId: listing?.id,
            type: "SOLD_ALERT",
            title: `${vehicle.make} ${vehicle.model} sold`,
            message: "Confirm removal or update of any active marketplace listing.",
            severity: "critical"
          }
        });
      }

      upserted += 1;
    } catch (error) {
      skipped += 1;
      errors.push({
        row: index + 1,
        message: error instanceof Error ? error.message : "Unknown import error"
      });
    }
  }

  await prisma.sourceSyncRun.update({
    where: { id: syncRun.id },
    data: {
      status: errors.length > 0 ? "PARTIAL" : "SUCCESS",
      finishedAt: new Date(),
      recordsUpserted: upserted,
      recordsSkipped: skipped,
      errors,
      message: `${upserted} vehicles upserted, ${skipped} skipped.`
    }
  });

  await prisma.activityEvent.create({
    data: {
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "imported_inventory",
      metadata: { sourceId: source.id, upserted, skipped }
    }
  });

  return NextResponse.json({ sourceId: source.id, syncRunId: syncRun.id, upserted, skipped, errors });
}
