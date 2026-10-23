import { NextRequest } from "next/server";
import { prisma } from "@okauto/database";
import {
  ApiErrorCode,
  extensionEventSchema,
  isOnSaleVehicle,
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
import { ListingGuardError } from "@/lib/listing-guards";
import { summarizeExtensionEventLog } from "@/lib/extension-event-log";
import {
  marketplaceUrlFromMetadata,
  recordPublishedMarketplaceListing,
} from "@/lib/extension-listings";

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
      const canonical = marketplaceUrlFromMetadata(data.metadata);
      if (!canonical) {
        return apiError(ApiErrorCode.MARKETPLACE_ITEM_URL_REQUIRED, 422);
      }

      try {
        const listing = await recordPublishedMarketplaceListing({
          auth,
          vehicleId: data.vehicleId,
          externalUrl: canonical.externalUrl,
          metadata: {
            ...(data.metadata ?? {}),
            externalUrl: canonical.externalUrl,
            externalId: canonical.externalId,
            source:
              typeof data.metadata?.source === "string"
                ? data.metadata.source
                : "extension",
          },
        });
        return jsonResponse({
          listingId: listing.id,
          success: true,
          alreadyExists: listing.alreadyExists,
          externalId: listing.externalId,
          externalUrl: listing.externalUrl,
        });
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
