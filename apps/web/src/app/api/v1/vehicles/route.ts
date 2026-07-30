import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { vehicleCreateSchema } from "@okauto/shared";
import { authenticateRequest } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { handleRouteError, jsonCreated, jsonError, jsonOk } from "@/lib/http";
import { vehicleContentHash } from "@/lib/inventory";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) return jsonError(auth.error, auth.status);

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q");
    const take = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
    const skip = Number(url.searchParams.get("offset") ?? 0);

    const where = {
      orgId: auth.org.id,
      ...(status ? { status: status as never } : {}),
      ...(q
        ? {
            OR: [
              { stockNumber: { contains: q, mode: "insensitive" as const } },
              { vin: { contains: q, mode: "insensitive" as const } },
              { make: { contains: q, mode: "insensitive" as const } },
              { model: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      db.vehicle.findMany({
        where,
        include: {
          media: { orderBy: { sortOrder: "asc" } },
          listings: {
            where: { status: { in: ["PUBLISHED", "ASSISTING", "NEEDS_REMOVAL", "PRICE_STALE"] } },
            select: { id: true, status: true, userId: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take,
        skip,
      }),
      db.vehicle.count({ where }),
    ]);

    return jsonOk({ items, total, take, skip });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, "MANAGER");
    if ("error" in auth) return jsonError(auth.error, auth.status);

    const body = vehicleCreateSchema.parse(await req.json());
    const vehicle = await db.vehicle.create({
      data: {
        orgId: auth.org.id,
        vin: body.vin || null,
        stockNumber: body.stockNumber,
        year: body.year,
        make: body.make,
        model: body.model,
        trim: body.trim,
        priceCents: body.priceCents,
        mileage: body.mileage,
        bodyStyle: body.bodyStyle,
        exteriorColor: body.exteriorColor,
        interiorColor: body.interiorColor,
        drivetrain: body.drivetrain,
        transmission: body.transmission,
        fuelType: body.fuelType,
        description: body.description,
        category: body.category,
        status: body.status,
        contentHash: vehicleContentHash({
          stockNumber: body.stockNumber,
          priceCents: body.priceCents,
          status: body.status,
          mileage: body.mileage,
        }),
        media: body.photoUrls?.length
          ? {
              create: body.photoUrls.map((url, sortOrder) => ({
                url,
                sortOrder,
              })),
            }
          : undefined,
      },
      include: { media: true },
    });

    await writeAudit(auth, "VEHICLE_CREATED", "Vehicle", vehicle.id, {
      stockNumber: vehicle.stockNumber,
    });

    return jsonCreated({ vehicle });
  } catch (err) {
    return handleRouteError(err);
  }
}
