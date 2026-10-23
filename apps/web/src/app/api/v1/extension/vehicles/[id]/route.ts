import { NextRequest } from "next/server";
import { prisma } from "@okauto/database";
import {
  ApiErrorCode,
  generateMarketplaceTitle,
  listingDescriptionForExtension,
  resolveIncludeCarfaxSourceUrl,
  withStockInTitle,
} from "@okauto/shared";
import { onSaleInventoryWhere } from "@/lib/on-sale-query";
import { apiError, handleApiError, jsonResponse } from "@/lib/api";
import { authenticateExtensionApiKey } from "@/lib/extension-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await authenticateExtensionApiKey(
      request.headers.get("x-api-key"),
    );
    if (!authResult.ok) return authResult.response;
    const auth = authResult.auth;

    const { id } = await params;
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        organizationId: auth.orgId,
        AND: [{ id }, await onSaleInventoryWhere(auth.orgId)],
      },
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
    if (!vehicle) return apiError(ApiErrorCode.VEHICLE_NOT_FOUND, 404);

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
        title: withStockInTitle(
          draft?.title || generateMarketplaceTitle(marketplaceData),
          vehicle.stockNumber,
        ),
        description: listingDescriptionForExtension(
          draft?.description,
          marketplaceData,
        ),
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
