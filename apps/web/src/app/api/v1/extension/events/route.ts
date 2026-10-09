import { NextRequest } from "next/server";
import { prisma } from "@okauto/database";
import {
  extensionEventSchema,
  generateMarketplaceTitle,
  generateTemplateDescription,
  isFacebookMarketplaceItemUrl,
  resolveIncludeCarfaxSourceUrl,
} from "@okauto/shared";
import { authenticateApiKey } from "@/lib/auth";
import {
  jsonResponse,
  errorResponse,
  handleApiError,
  parseBody,
} from "@/lib/api";
import {
  ListingGuardError,
  withListingCreateLock,
} from "@/lib/listing-guards";

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey) return errorResponse("API key required", 401);

    const auth = await authenticateApiKey(apiKey);
    if (!auth) return errorResponse("Invalid API key", 401);

    const body = await parseBody<unknown>(request);
    const data = extensionEventSchema.parse(body);

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: data.vehicleId, organizationId: auth.orgId },
      include: {
        organization: true,
        photos: { orderBy: { sortOrder: "asc" } },
        marketplaceDrafts: {
          where: { userId: auth.user.id, platform: "facebook_marketplace" },
          take: 1,
        },
      },
    });
    if (!vehicle) return errorResponse("Vehicle not found", 404);

    if (data.eventType === "listing_created") {
      const externalUrl = String(data.metadata?.externalUrl ?? "");
      if (!isFacebookMarketplaceItemUrl(externalUrl)) {
        return errorResponse(
          "A published Facebook Marketplace item URL is required",
          422,
        );
      }

      const draft = vehicle.marketplaceDrafts[0];
      const vehicleData = {
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
          vehicle.organization.includeCarfaxSourceUrl,
          vehicle.includeCarfaxSourceUrl,
        ),
        location: vehicle.location,
      };

      try {
        const listing = await withListingCreateLock(
          {
            organizationId: auth.orgId,
            userId: auth.user.id,
            vehicleId: data.vehicleId,
            platform: "facebook_marketplace",
          },
          async (tx, { ownActiveId }) => {
            if (ownActiveId) {
              return { id: ownActiveId, alreadyExists: true as const };
            }
            const created = await tx.listing.create({
              data: {
                organizationId: auth.orgId,
                vehicleId: data.vehicleId,
                userId: auth.user.id,
                externalUrl,
                priceAtListing: vehicle.price,
                titleAtListing:
                  draft?.title || generateMarketplaceTitle(vehicleData),
                descriptionAtListing:
                  draft?.description || generateTemplateDescription(vehicleData),
                photoUrlsAtListing: draft?.photoOrder.length
                  ? draft.photoOrder
                  : vehicle.photos.map((photo) => photo.url),
                events: {
                  create: {
                    eventType: data.eventType,
                    metadata: data.metadata as never,
                  },
                },
              },
            });
            return { id: created.id, alreadyExists: false as const };
          },
        );
        if (listing.alreadyExists) {
          return jsonResponse({
            listingId: listing.id,
            success: true,
            alreadyExists: true,
          });
        }
        return jsonResponse({ listingId: listing.id, success: true });
      } catch (err) {
        if (err instanceof ListingGuardError) {
          return jsonResponse({ error: err.message, ...err.extra }, err.status);
        }
        throw err;
      }
    }

    if (data.eventType === "listing_removed" && data.listingId) {
      const listing = await prisma.listing.findFirst({
        where: {
          id: data.listingId,
          organizationId: auth.orgId,
          vehicleId: data.vehicleId,
          userId: auth.user.id,
        },
      });
      if (!listing) return errorResponse("Listing not found", 404);

      await prisma.listing.update({
        where: { id: listing.id },
        data: { status: "REMOVED", removedAt: new Date() },
      });
      await prisma.listingEvent.create({
        data: {
          listingId: listing.id,
          eventType: data.eventType,
          metadata: data.metadata as never,
        },
      });
      return jsonResponse({ success: true });
    }

    if (data.listingId) {
      const listing = await prisma.listing.findFirst({
        where: {
          id: data.listingId,
          organizationId: auth.orgId,
          vehicleId: data.vehicleId,
          userId: auth.user.id,
        },
      });
      if (!listing) return errorResponse("Listing not found", 404);
      await prisma.listingEvent.create({
        data: {
          listingId: listing.id,
          eventType: data.eventType,
          metadata: data.metadata as never,
        },
      });
    }

    return jsonResponse({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
