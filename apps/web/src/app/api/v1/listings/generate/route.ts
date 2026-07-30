import { getSessionFromRequest, hasAnyRole } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@okauto/db";
import {
  buildMarketplaceDescription,
  buildListingTitle,
  demoDescriptionFor,
  demoVehicles,
  type VehicleInput
} from "@okauto/shared";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

interface PersistedVehicle {
  vin: string | null;
  stockNumber: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  bodyStyle: string | null;
  drivetrain: string | null;
  transmission: string | null;
  fuelType: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  mileage: number | null;
  price: number | null;
  status: VehicleInput["status"];
  location: string | null;
  features: string[];
  notes: string | null;
}

function toVehicleInput(vehicle: PersistedVehicle): VehicleInput {
  return {
    vin: vehicle.vin ?? undefined,
    stockNumber: vehicle.stockNumber ?? undefined,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim ?? undefined,
    bodyStyle: vehicle.bodyStyle ?? undefined,
    drivetrain: vehicle.drivetrain ?? undefined,
    transmission: vehicle.transmission ?? undefined,
    fuelType: vehicle.fuelType ?? undefined,
    exteriorColor: vehicle.exteriorColor ?? undefined,
    interiorColor: vehicle.interiorColor ?? undefined,
    mileage: vehicle.mileage ?? undefined,
    price: vehicle.price ?? undefined,
    status: vehicle.status,
    location: vehicle.location ?? undefined,
    features: vehicle.features,
    notes: vehicle.notes ?? undefined
  };
}

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return jsonError("UNAUTHORIZED", "Sign in to generate listing copy.", 401);
  }

  if (!process.env.DATABASE_URL) {
    const vehicle = demoVehicles[0];
    if (!vehicle) {
      return jsonError("NO_DEMO_VEHICLE", "Demo vehicle data is unavailable.", 500);
    }
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

  const input = toVehicleInput(vehicle);
  return NextResponse.json({
    title: buildListingTitle(input),
    description: buildMarketplaceDescription(input)
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

  const input = toVehicleInput(vehicle);
  const title = buildListingTitle(input);
  const description = buildMarketplaceDescription(input);

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
