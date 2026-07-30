import { getSessionFromRequest, hasAnyRole } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@okauto/db";
import { buildMarketplaceDescription, buildListingTitle, demoDescriptionFor, demoVehicles } from "@okauto/shared";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return jsonError("UNAUTHORIZED", "Sign in to generate listing copy.", 401);
  }

  if (!process.env.DATABASE_URL) {
    const vehicle = demoVehicles[0];
    return NextResponse.json({
      title: buildListingTitle(vehicle),
      description: demoDescriptionFor(vehicle.id),
      photoChecklist: []
    });
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { organizationId: session.organizationId },
    orderBy: { updatedAt: "desc" }
  });

  if (!vehicle) {
    return jsonError("NO_VEHICLE", "Import inventory before generating a listing.", 404);
  }

  return NextResponse.json({
    title: buildListingTitle({ ...vehicle, features: vehicle.features, status: vehicle.status }),
    description: buildMarketplaceDescription({
      ...vehicle,
      features: vehicle.features,
      status: vehicle.status
    })
  });
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return jsonError("UNAUTHORIZED", "Sign in to generate listing copy.", 401);
  }

  if (!hasAnyRole(session, ["OWNER", "MANAGER", "SALESPERSON"])) {
    return jsonError("FORBIDDEN", "Your role cannot generate listing drafts.", 403);
  }

  const { vehicleId } = (await request.json()) as { vehicleId?: string };
  if (!vehicleId) {
    return jsonError("MISSING_VEHICLE_ID", "vehicleId is required.", 422);
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, organizationId: session.organizationId }
  });

  if (!vehicle) {
    return jsonError("VEHICLE_NOT_FOUND", "Vehicle does not exist in this organization.", 404);
  }

  const title = buildListingTitle({ ...vehicle, features: vehicle.features, status: vehicle.status });
  const description = buildMarketplaceDescription({
    ...vehicle,
    features: vehicle.features,
    status: vehicle.status
  });

  const listing = await prisma.listing.create({
    data: {
      organizationId: session.organizationId,
      vehicleId: vehicle.id,
      assignedToUserId: session.userId,
      title,
      description,
      price: vehicle.price,
      location: vehicle.location,
      status: "READY",
      snapshots: {
        create: {
          status: "READY",
          price: vehicle.price,
          notes: "Generated listing draft."
        }
      }
    }
  });

  await prisma.activityEvent.create({
    data: {
      organizationId: session.organizationId,
      actorUserId: session.userId,
      vehicleId: vehicle.id,
      listingId: listing.id,
      action: "generated_listing_draft"
    }
  });

  return NextResponse.json({ listingId: listing.id, title, description }, { status: 201 });
}
