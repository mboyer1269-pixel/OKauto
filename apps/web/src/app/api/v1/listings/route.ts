import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { formatVehicleTitle, listingCreateSchema } from "@okauto/shared";
import { authenticateRequest } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { generateDescription } from "@/lib/ai";
import { handleRouteError, jsonCreated, jsonError, jsonOk } from "@/lib/http";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) return jsonError(auth.error, auth.status);

    const url = new URL(req.url);
    const mine = url.searchParams.get("mine") === "1";
    const status = url.searchParams.get("status");

    const items = await db.listing.findMany({
      where: {
        orgId: auth.org.id,
        ...(mine ? { userId: auth.user.id } : {}),
        ...(status ? { status: status as never } : {}),
      },
      include: {
        vehicle: { include: { media: { take: 1, orderBy: { sortOrder: "asc" } } } },
        user: { select: { id: true, name: true, email: true } },
        events: { orderBy: { createdAt: "desc" }, take: 5 },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    return jsonOk({ items });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) return jsonError(auth.error, auth.status);

    const body = listingCreateSchema.parse(await req.json());
    const vehicle = await db.vehicle.findFirst({
      where: { id: body.vehicleId, orgId: auth.org.id },
      include: { media: { orderBy: { sortOrder: "asc" } } },
    });
    if (!vehicle) return jsonError("Vehicle not found", 404);
    if (vehicle.status === "SOLD" || vehicle.status === "ARCHIVED") {
      return jsonError("Cannot list sold or archived vehicles", 400);
    }

    const active = await db.listing.findFirst({
      where: {
        vehicleId: vehicle.id,
        status: { in: ["PUBLISHED", "ASSISTING", "READY", "PRICE_STALE"] },
      },
    });
    if (active) {
      return jsonError("An active listing already exists for this vehicle", 409, {
        listingId: active.id,
        status: active.status,
      });
    }

    const title = body.title ?? formatVehicleTitle(vehicle);
    const description =
      body.description ??
      (await generateDescription(vehicle, { tone: "professional" })).body;

    const listing = await db.listing.create({
      data: {
        orgId: auth.org.id,
        vehicleId: vehicle.id,
        userId: auth.user.id,
        status: "READY",
        title,
        description,
        priceCents: body.priceCents ?? vehicle.priceCents,
        events: {
          create: {
            actorId: auth.user.id,
            type: "CREATED",
            payload: { authMethod: auth.authMethod },
          },
        },
      },
      include: {
        vehicle: { include: { media: { orderBy: { sortOrder: "asc" } } } },
      },
    });

    await writeAudit(auth, "LISTING_CREATED", "Listing", listing.id, {
      vehicleId: vehicle.id,
    });

    return jsonCreated({
      listing,
      assist: {
        policy: {
          humanInTheLoop: true,
          neverBypassCaptcha: true,
          neverAutoPublish: true,
        },
        marketplaceCreateUrl: "https://www.facebook.com/marketplace/create/vehicle",
        payload: {
          title: listing.title,
          price: listing.priceCents / 100,
          description: listing.description,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          mileage: vehicle.mileage,
          bodyStyle: vehicle.bodyStyle,
          exteriorColor: vehicle.exteriorColor,
          photos: listing.vehicle.media.map((m) => m.url),
        },
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
