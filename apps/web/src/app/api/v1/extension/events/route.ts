import { NextRequest } from "next/server";
import { prisma } from "@okauto/database";
import {
  ApiErrorCode,
  extensionEventSchema,
  generateMarketplaceTitle,
  generateTemplateDescription,
  isFacebookMarketplaceItemUrl,
  isOnSaleVehicle,
  resolveIncludeCarfaxSourceUrl,
} from "@okauto/shared";
import {
  jsonResponse,
  apiError,
  errorResponse,
  handleApiError,
  listingGuardResponse,
  parseBody,
} from "@/lib/api";
import { authenticateExtensionApiKey } from "@/lib/extension-auth";
import {
  ListingGuardError,
  withListingCreateLock,
} from "@/lib/listing-guards";
import { summarizeExtensionEventLog } from "@/lib/extension-event-log";

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateExtensionApiKey(
      request.headers.get("x-api-key"),
    );
    if (!authResult.ok) return authResult.response;
    const auth = authResult.auth;

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
        syncSource: {
          select: {
            isActive: true,
            lastSyncStatus: true,
            lastSyncAt: true,
          },
        },
      },
    });
    if (!vehicle) return apiError(ApiErrorCode.VEHICLE_NOT_FOUND, 404);
    if (data.eventType === "listing_created" && !isOnSaleVehicle(vehicle)) {
      return errorResponse(
        "Ce véhicule n’est plus en vente et ne peut pas être publié.",
        409,
        undefined,
        { code: ApiErrorCode.VEHICLE_NOT_AVAILABLE },
      );
    }

    if (data.eventType === "listing_created") {
      const externalUrl = String(data.metadata?.externalUrl ?? "");
      if (!isFacebookMarketplaceItemUrl(externalUrl)) {
        return apiError(ApiErrorCode.MARKETPLACE_ITEM_URL_REQUIRED, 422);
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
          return listingGuardResponse(err);
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
      if (!listing) return apiError(ApiErrorCode.LISTING_NOT_FOUND, 404);

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

    if (
      data.eventType === "listing_error" ||
      data.eventType === "form_filled"
    ) {
      console.info(
        "[extension-event]",
        summarizeExtensionEventLog({
          eventType: data.eventType,
          organizationId: auth.orgId,
          vehicleId: data.vehicleId,
          listingId: data.listingId ?? null,
          metadata: data.metadata,
        }),
      );
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
      if (!listing) return apiError(ApiErrorCode.LISTING_NOT_FOUND, 404);
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
