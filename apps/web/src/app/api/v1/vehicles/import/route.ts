import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { authenticateRequest } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { handleRouteError, jsonError, jsonOk } from "@/lib/http";
import { parseInventoryCsv, vehicleContentHash } from "@/lib/inventory";

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, "MANAGER");
    if ("error" in auth) return jsonError(auth.error, auth.status);

    const contentType = req.headers.get("content-type") ?? "";
    let csvText = "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return jsonError("file is required");
      csvText = await file.text();
    } else {
      const body = (await req.json()) as { csv?: string };
      if (!body.csv) return jsonError("csv is required");
      csvText = body.csv;
    }

    const { rows, errors } = parseInventoryCsv(csvText);
    if (!rows.length) {
      return jsonError("No valid rows to import", 400, { errors });
    }

    let source = await db.inventorySource.findFirst({
      where: { orgId: auth.org.id, type: "CSV_UPLOAD" },
    });
    if (!source) {
      source = await db.inventorySource.create({
        data: {
          orgId: auth.org.id,
          name: "CSV uploads",
          type: "CSV_UPLOAD",
          health: "HEALTHY",
        },
      });
    }

    let created = 0;
    let updated = 0;
    let soldDetected = 0;

    for (const row of rows) {
      const existing = await db.vehicle.findFirst({
        where: {
          orgId: auth.org.id,
          OR: [
            { stockNumber: row.stockNumber },
            ...(row.vin ? [{ vin: row.vin }] : []),
          ],
        },
        include: {
          listings: {
            where: { status: { in: ["PUBLISHED", "ASSISTING", "PRICE_STALE"] } },
          },
        },
      });

      const hash = vehicleContentHash({
        stockNumber: row.stockNumber,
        priceCents: row.priceCents,
        status: row.status ?? "AVAILABLE",
        mileage: row.mileage,
      });

      if (!existing) {
        await db.vehicle.create({
          data: {
            orgId: auth.org.id,
            sourceId: source.id,
            vin: row.vin,
            stockNumber: row.stockNumber,
            year: row.year,
            make: row.make,
            model: row.model,
            trim: row.trim,
            priceCents: row.priceCents,
            mileage: row.mileage,
            bodyStyle: row.bodyStyle,
            exteriorColor: row.exteriorColor,
            interiorColor: row.interiorColor,
            drivetrain: row.drivetrain,
            transmission: row.transmission,
            fuelType: row.fuelType,
            description: row.description,
            status: row.status ?? "AVAILABLE",
            category: row.category ?? "AUTOMOTIVE",
            contentHash: hash,
            soldAt: row.status === "SOLD" ? new Date() : null,
            media: row.photoUrls.length
              ? {
                  create: row.photoUrls.map((url, sortOrder) => ({ url, sortOrder })),
                }
              : undefined,
          },
        });
        created++;
        continue;
      }

      const becameSold =
        existing.status !== "SOLD" && (row.status ?? existing.status) === "SOLD";
      const priceChanged = existing.priceCents !== row.priceCents;

      await db.vehicle.update({
        where: { id: existing.id },
        data: {
          vin: row.vin ?? existing.vin,
          year: row.year,
          make: row.make,
          model: row.model,
          trim: row.trim ?? existing.trim,
          previousPriceCents: priceChanged ? existing.priceCents : existing.previousPriceCents,
          priceCents: row.priceCents,
          mileage: row.mileage ?? existing.mileage,
          bodyStyle: row.bodyStyle ?? existing.bodyStyle,
          exteriorColor: row.exteriorColor ?? existing.exteriorColor,
          interiorColor: row.interiorColor ?? existing.interiorColor,
          drivetrain: row.drivetrain ?? existing.drivetrain,
          transmission: row.transmission ?? existing.transmission,
          fuelType: row.fuelType ?? existing.fuelType,
          description: row.description ?? existing.description,
          status: row.status ?? existing.status,
          category: row.category ?? existing.category,
          contentHash: hash,
          soldAt: becameSold ? new Date() : existing.soldAt,
          sourceId: source.id,
        },
      });
      updated++;

      if (becameSold && existing.listings.length) {
        soldDetected++;
        for (const listing of existing.listings) {
          await db.listing.update({
            where: { id: listing.id },
            data: { status: "NEEDS_REMOVAL" },
          });
          await db.listingEvent.create({
            data: {
              listingId: listing.id,
              type: "SOLD_DETECTED",
              payload: { via: "csv_import" },
            },
          });
          await db.notification.create({
            data: {
              orgId: auth.org.id,
              userId: listing.userId,
              type: "VEHICLE_SOLD",
              title: "Vehicle sold — remove Marketplace listing",
              body: `${row.year} ${row.make} ${row.model} (${row.stockNumber}) is sold.`,
              meta: { vehicleId: existing.id, listingId: listing.id },
            },
          });
        }
      } else if (priceChanged && existing.listings.length) {
        for (const listing of existing.listings) {
          await db.listing.update({
            where: { id: listing.id },
            data: { status: "PRICE_STALE", priceCents: row.priceCents },
          });
          await db.notification.create({
            data: {
              orgId: auth.org.id,
              userId: listing.userId,
              type: "PRICE_CHANGED",
              title: "Listed vehicle price changed",
              body: `${row.year} ${row.make} ${row.model} price updated to $${(row.priceCents / 100).toLocaleString()}.`,
              meta: { vehicleId: existing.id, listingId: listing.id },
            },
          });
        }
      }
    }

    await db.inventorySource.update({
      where: { id: source.id },
      data: {
        lastSyncAt: new Date(),
        health: errors.length ? "DEGRADED" : "HEALTHY",
        lastError: errors.length ? `${errors.length} row errors` : null,
      },
    });

    await db.jobRun.create({
      data: {
        orgId: auth.org.id,
        type: "inventory.import",
        status: "SUCCEEDED",
        startedAt: new Date(),
        finishedAt: new Date(),
        stats: { created, updated, soldDetected, errors: errors.length },
      },
    });

    await writeAudit(auth, "INVENTORY_IMPORTED", "InventorySource", source.id, {
      created,
      updated,
      soldDetected,
    });

    return jsonOk({ created, updated, soldDetected, errors, totalParsed: rows.length });
  } catch (err) {
    return handleRouteError(err);
  }
}
