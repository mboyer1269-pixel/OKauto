import { NextRequest } from "next/server";
import { prisma } from "@okauto/database";
import {
  generateMarketplaceTitle,
  generateTemplateDescription,
  resolveIncludeCarfaxSourceUrl,
} from "@okauto/shared";
import { authenticateApiKey } from "@/lib/auth";
import { errorResponse, handleApiError, jsonResponse } from "@/lib/api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey) return errorResponse("API key required", 401);

    const auth = await authenticateApiKey(apiKey);
    if (!auth) return errorResponse("Invalid API key", 401);

    const { id } = await params;
    const vehicle = await prisma.vehicle.findFirst({
      where: { id, organizationId: auth.orgId, status: "AVAILABLE" },
      include: {
        photos: { orderBy: { sortOrder: "asc" } },
        listings: {
          where: { status: "ACTIVE", userId: auth.user.id },
          select: { id: true },
        },
        marketplaceDrafts: {
          where: {
            userId: auth.user.id,
            platform: "facebook_marketplace",
          },
          select: { title: true, description: true, photoOrder: true },
          take: 1,
        },
      },
    });
    if (!vehicle) return errorResponse("Vehicle not found", 404);

    const marketplaceData = {
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      mileage: vehicle.mileage,
      price: vehicle.price ? Number(vehicle.price) : null,
      exteriorColor: vehicle.exteriorColor,
      interiorColor: vehicle.interiorColor,
      transmission: vehicle.transmission,
      fuelType: vehicle.fuelType,
      drivetrain: vehicle.drivetrain,
      engine: vehicle.engine,
      bodyStyle: vehicle.bodyStyle,
      condition: vehicle.condition,
      features: vehicle.features,
      dealershipName: auth.organization.name,
      contactName: auth.user.name,
      phone: auth.organization.phone ?? undefined,
      vin: vehicle.vin,
      stockNumber: vehicle.stockNumber,
      sourceUrl: vehicle.sourceUrl,
      includeCarfaxSourceUrl: resolveIncludeCarfaxSourceUrl(
        auth.organization.includeCarfaxSourceUrl,
        vehicle.includeCarfaxSourceUrl,
      ),
      location: [
        auth.organization.address,
        auth.organization.city,
        auth.organization.state,
      ]
        .filter(Boolean)
        .join(", "),
    };
    const draft = vehicle.marketplaceDrafts[0];

    return jsonResponse({
      vehicle: {
        id: vehicle.id,
        vin: vehicle.vin,
        stockNumber: vehicle.stockNumber,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        mileage: vehicle.mileage,
        price: vehicle.price ? Number(vehicle.price) : null,
        exteriorColor: vehicle.exteriorColor,
        interiorColor: vehicle.interiorColor,
        transmission: vehicle.transmission,
        fuelType: vehicle.fuelType,
        drivetrain: vehicle.drivetrain,
        engine: vehicle.engine,
        features: vehicle.features,
        title: draft?.title || generateMarketplaceTitle(marketplaceData),
        description:
          draft?.description || generateTemplateDescription(marketplaceData),
        contactName: auth.user.name,
        dealershipName: auth.organization.name,
        phone: auth.organization.phone,
        bodyStyle: vehicle.bodyStyle,
        condition: vehicle.condition,
        sourceUrl: vehicle.sourceUrl,
        includeCarfaxSourceUrl: resolveIncludeCarfaxSourceUrl(
          auth.organization.includeCarfaxSourceUrl,
          vehicle.includeCarfaxSourceUrl,
        ),
        photos: vehicle.photos.map((photo) => photo.url),
        hasActiveListing: vehicle.listings.length > 0,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
