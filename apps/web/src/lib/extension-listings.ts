import { prisma } from "@okauto/database";
import {
  ApiErrorCode,
  canonicalMarketplaceListingFields,
  facebookMarketplaceItemUrl,
  generateMarketplaceTitle,
  generateTemplateDescription,
  isOnSaleVehicle,
  resolveIncludeCarfaxSourceUrl,
  withStockInTitle,
} from "@okauto/shared";
import { ListingGuardError, withListingCreateLock } from "@/lib/listing-guards";

type ExtensionAuth = {
  orgId: string;
  user: { id: string; name: string };
  organization: {
    name: string;
    phone?: string | null;
    includeCarfaxSourceUrl?: boolean | null;
  };
};

export type RecordedMarketplaceListing = {
  id: string;
  alreadyExists: boolean;
  externalId: string;
  externalUrl: string;
};

export function marketplaceUrlFromMetadata(
  metadata?: Record<string, unknown> | null,
): { externalId: string; externalUrl: string } | null {
  const rawUrl = String(metadata?.externalUrl ?? "");
  const fromUrl = canonicalMarketplaceListingFields(rawUrl);
  if (fromUrl) return fromUrl;
  const rawId = String(metadata?.externalId ?? "").trim();
  if (!rawId) return null;
  return canonicalMarketplaceListingFields(facebookMarketplaceItemUrl(rawId));
}

export async function recordPublishedMarketplaceListing(input: {
  auth: ExtensionAuth;
  vehicleId: string;
  externalUrl: string;
  metadata?: Record<string, unknown> | null;
}): Promise<RecordedMarketplaceListing> {
  const canonical = canonicalMarketplaceListingFields(input.externalUrl);
  if (!canonical) {
    throw new ListingGuardError(
      422,
      "L’URL d’une annonce Facebook Marketplace publiée est requise (elle doit contenir /marketplace/item/).",
      {},
      ApiErrorCode.MARKETPLACE_ITEM_URL_REQUIRED,
    );
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, organizationId: input.auth.orgId },
    include: {
      organization: true,
      photos: { orderBy: { sortOrder: "asc" } },
      marketplaceDrafts: {
        where: {
          userId: input.auth.user.id,
          platform: "facebook_marketplace",
        },
        take: 1,
      },
    },
  });
  if (!vehicle) {
    throw new ListingGuardError(
      404,
      "Véhicule introuvable",
      {},
      ApiErrorCode.VEHICLE_NOT_FOUND,
    );
  }
  if (!isOnSaleVehicle(vehicle)) {
    throw new ListingGuardError(
      409,
      "Ce véhicule n’est plus en vente et ne peut pas être publié.",
      {},
      ApiErrorCode.VEHICLE_NOT_AVAILABLE,
    );
  }

  const claimedByOther = await prisma.listing.findFirst({
    where: {
      organizationId: input.auth.orgId,
      platform: "facebook_marketplace",
      status: "ACTIVE",
      externalId: canonical.externalId,
      NOT: { vehicleId: input.vehicleId },
    },
    include: {
      vehicle: {
        select: { stockNumber: true, year: true, make: true, model: true },
      },
    },
  });
  if (claimedByOther) {
    const label = [
      claimedByOther.vehicle.year,
      claimedByOther.vehicle.make,
      claimedByOther.vehicle.model,
      claimedByOther.vehicle.stockNumber
        ? `stock ${claimedByOther.vehicle.stockNumber}`
        : null,
    ]
      .filter(Boolean)
      .join(" ");
    throw new ListingGuardError(
      409,
      `Cette annonce Facebook est déjà reliée à ${label || "un autre véhicule"}.`,
      { listingId: claimedByOther.id },
      ApiErrorCode.ACTIVE_LISTING_EXISTS,
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
    dealershipName: input.auth.organization.name,
    contactName: input.auth.user.name,
    phone: input.auth.organization.phone ?? undefined,
    vin: vehicle.vin,
    stockNumber: vehicle.stockNumber,
    sourceUrl: vehicle.sourceUrl,
    includeCarfaxSourceUrl: resolveIncludeCarfaxSourceUrl(
      vehicle.organization.includeCarfaxSourceUrl,
      vehicle.includeCarfaxSourceUrl,
    ),
    location: vehicle.location,
  };

  const listing = await withListingCreateLock(
    {
      organizationId: input.auth.orgId,
      userId: input.auth.user.id,
      vehicleId: input.vehicleId,
      platform: "facebook_marketplace",
    },
    async (tx, { ownActiveId }) => {
      if (ownActiveId) {
        const existing = await tx.listing.findUnique({
          where: { id: ownActiveId },
          select: { externalUrl: true, externalId: true },
        });
        const unchanged =
          existing?.externalUrl === canonical.externalUrl &&
          existing?.externalId === canonical.externalId;
        if (unchanged) {
          return { id: ownActiveId, alreadyExists: true as const };
        }
        await tx.listing.update({
          where: { id: ownActiveId },
          data: {
            externalUrl: canonical.externalUrl,
            externalId: canonical.externalId,
          },
        });
        await tx.listingEvent.create({
          data: {
            listingId: ownActiveId,
            eventType: "listing_updated",
            metadata: {
              ...(input.metadata ?? {}),
              externalUrl: canonical.externalUrl,
              externalId: canonical.externalId,
              previousExternalUrl: existing?.externalUrl ?? null,
              previousExternalId: existing?.externalId ?? null,
              source:
                typeof input.metadata?.source === "string"
                  ? input.metadata.source
                  : "extension",
            } as never,
          },
        });
        return { id: ownActiveId, alreadyExists: true as const };
      }

      const created = await tx.listing.create({
        data: {
          organizationId: input.auth.orgId,
          vehicleId: input.vehicleId,
          userId: input.auth.user.id,
          externalUrl: canonical.externalUrl,
          externalId: canonical.externalId,
          priceAtListing: vehicle.price,
          titleAtListing: withStockInTitle(
            draft?.title || generateMarketplaceTitle(vehicleData),
            vehicle.stockNumber,
          ),
          descriptionAtListing:
            draft?.description || generateTemplateDescription(vehicleData),
          photoUrlsAtListing: draft?.photoOrder.length
            ? draft.photoOrder
            : vehicle.photos.map((photo) => photo.url),
          events: {
            create: {
              eventType: "listing_created",
              metadata: (input.metadata ?? {
                externalUrl: canonical.externalUrl,
                externalId: canonical.externalId,
                source: "extension",
              }) as never,
            },
          },
        },
      });
      return { id: created.id, alreadyExists: false as const };
    },
  );

  return {
    id: listing.id,
    alreadyExists: listing.alreadyExists,
    externalId: canonical.externalId,
    externalUrl: canonical.externalUrl,
  };
}
