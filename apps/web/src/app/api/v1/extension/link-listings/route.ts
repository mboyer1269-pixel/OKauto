import { NextRequest } from "next/server";
import { prisma } from "@okauto/database";
import {
  extractFacebookMarketplaceItemId,
  facebookMarketplaceItemUrl,
  isFacebookMarketplaceItemUrl,
  linkListingsSchema,
  matchListingToVehicle,
} from "@okauto/shared";
import {
  handleApiError,
  jsonResponse,
  listingGuardResponse,
  parseBody,
} from "@/lib/api";
import { authenticateExtensionApiKey } from "@/lib/extension-auth";
import { ListingGuardError } from "@/lib/listing-guards";
import { recordPublishedMarketplaceListing } from "@/lib/extension-listings";
import { onSaleInventoryWhere } from "@/lib/on-sale-query";

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateExtensionApiKey(
      request.headers.get("x-api-key"),
    );
    if (!authResult.ok) return authResult.response;
    const auth = authResult.auth;

    const body = await parseBody<unknown>(request);
    const data = linkListingsSchema.parse(body);

    const vehicles = await prisma.vehicle.findMany({
      where: {
        organizationId: auth.orgId,
        AND: [await onSaleInventoryWhere(auth.orgId)],
      },
      select: {
        id: true,
        vin: true,
        stockNumber: true,
        year: true,
        make: true,
        model: true,
      },
    });

    const results: Array<Record<string, unknown>> = [];

    for (const listing of data.listings) {
      const itemId = extractFacebookMarketplaceItemId(listing.externalUrl);
      const externalUrl = itemId
        ? facebookMarketplaceItemUrl(itemId)
        : listing.externalUrl;

      if (!isFacebookMarketplaceItemUrl(externalUrl)) {
        results.push({
          status: "invalid",
          externalUrl: listing.externalUrl,
          error: "URL Marketplace invalide.",
        });
        continue;
      }

      const match = matchListingToVehicle(vehicles, {
        vehicleId: listing.vehicleId,
        title: listing.title,
        text: listing.text,
      });

      if (!match) {
        results.push({
          status: "unmatched",
          externalUrl,
          title: listing.title ?? null,
        });
        continue;
      }

      try {
        const recorded = await recordPublishedMarketplaceListing({
          auth,
          vehicleId: match.vehicle.id,
          externalUrl,
          metadata: {
            externalUrl,
            source: "extension_relier",
            matchReason: match.reason,
            title: listing.title,
          },
        });
        results.push({
          status: recorded.alreadyExists ? "already_linked" : "linked",
          listingId: recorded.id,
          vehicleId: match.vehicle.id,
          matchReason: match.reason,
          externalId: recorded.externalId,
          externalUrl: recorded.externalUrl,
          stockNumber: match.vehicle.stockNumber,
          vin: match.vehicle.vin,
          year: match.vehicle.year,
          make: match.vehicle.make,
          model: match.vehicle.model,
        });
      } catch (err) {
        if (err instanceof ListingGuardError) {
          results.push({
            status: "error",
            externalUrl,
            vehicleId: match.vehicle.id,
            error: err.message,
            code: err.code,
          });
          continue;
        }
        throw err;
      }
    }

    const linked = results.filter((item) => item.status === "linked").length;
    const alreadyLinked = results.filter(
      (item) => item.status === "already_linked",
    ).length;
    const unmatched = results.filter((item) => item.status === "unmatched").length;

    return jsonResponse({
      success: true,
      counts: {
        linked,
        alreadyLinked,
        unmatched,
        error: results.filter((item) => item.status === "error" || item.status === "invalid")
          .length,
      },
      results,
    });
  } catch (err) {
    if (err instanceof ListingGuardError) {
      return listingGuardResponse(err);
    }
    return handleApiError(err);
  }
}
