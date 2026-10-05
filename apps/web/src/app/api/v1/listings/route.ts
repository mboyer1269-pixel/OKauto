import { prisma } from "@okauto/database";
import {
  createListingSchema,
  generateMarketplaceTitle,
  generateTemplateDescription,
  hasMinRole,
  isFacebookMarketplaceItemUrl,
} from "@okauto/shared";
import { withAuth, jsonResponse, errorResponse, parseBody } from "@/lib/api";
import { createAuditLog } from "@/lib/auth";
import { listingHealthPayload } from "@/lib/sales-ops";
import {
  ListingGuardError,
  withListingCreateLock,
} from "@/lib/listing-guards";

export const GET = withAuth(async (request, { auth }) => {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const scope = url.searchParams.get("scope");
  const healthFilter = url.searchParams.get("health");
  const parsedPage = parseInt(url.searchParams.get("page") ?? "1", 10);
  const parsedLimit = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(250, Math.max(1, parsedLimit))
    : 20;

  if (scope === "team" && !hasMinRole(auth.role, "MANAGER")) {
    return errorResponse("Accès insuffisant", 403);
  }

  const where: Record<string, unknown> = {
    organizationId: auth.orgId,
  };
  if (scope !== "team") where.userId = auth.sub;
  if (status) where.status = status;

  const [listings, total, countsByStatus, activeForHealth] = await Promise.all([
    prisma.listing.findMany({
      where,
      include: {
        vehicle: {
          include: { photos: { where: { isPrimary: true }, take: 1 } },
        },
        user: { select: { id: true, name: true, email: true } },
        events: { orderBy: { createdAt: "desc" }, take: 5 },
      },
      orderBy: { listedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.listing.count({ where }),
    prisma.listing.groupBy({
      by: ["status"],
      where: {
        organizationId: auth.orgId,
        ...(scope === "team" ? {} : { userId: auth.sub }),
      },
      _count: { _all: true },
    }),
    prisma.listing.findMany({
      where: {
        organizationId: auth.orgId,
        status: "ACTIVE",
        ...(scope === "team" ? {} : { userId: auth.sub }),
      },
      include: { vehicle: { select: { price: true } } },
    }),
  ]);

  const counts = Object.fromEntries(
    countsByStatus.map((entry) => [entry.status, entry._count._all]),
  ) as Record<string, number>;
  counts.PRICE_MISMATCH = activeForHealth.filter(
    (listing) => listingHealthPayload(listing).priceMismatch,
  ).length;
  counts.RENEW_DUE = activeForHealth.filter(
    (listing) => listingHealthPayload(listing).renewDue,
  ).length;

  const withHealth = listings
    .map((listing) => ({
      ...listing,
      health: listingHealthPayload(listing),
      hoursStale: listingHealthPayload(listing).hoursStale,
    }))
    .filter((listing) => {
      if (healthFilter === "price") return Boolean(listing.health.priceMismatch);
      if (healthFilter === "renew") return listing.health.renewDue;
      return true;
    });

  return jsonResponse({
    listings: withHealth,
    counts,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const POST = withAuth(async (request, { auth }) => {
  const body = await parseBody<unknown>(request);
  const data = createListingSchema.parse(body);

  if (
    data.platform === "facebook_marketplace" &&
    (!data.externalUrl || !isFacebookMarketplaceItemUrl(data.externalUrl))
  ) {
    return jsonResponse(
      { error: "A published Facebook Marketplace item URL is required" },
      422,
    );
  }

  const [vehicle, salesperson] = await Promise.all([
    prisma.vehicle.findFirst({
      where: { id: data.vehicleId, organizationId: auth.orgId },
      include: {
        photos: { orderBy: { sortOrder: "asc" } },
        marketplaceDrafts: {
          where: { userId: auth.sub, platform: data.platform },
          take: 1,
        },
        organization: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: auth.sub },
      select: { name: true },
    }),
  ]);
  if (!vehicle) return jsonResponse({ error: "Vehicle not found" }, 404);
  if (vehicle.status !== "AVAILABLE") {
    return jsonResponse(
      { error: "Only an available vehicle can be published" },
      409,
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
    dealershipName: vehicle.organization.name,
    contactName: salesperson?.name,
    phone: vehicle.organization.phone ?? undefined,
    vin: vehicle.vin,
    stockNumber: vehicle.stockNumber,
    sourceUrl: vehicle.sourceUrl,
    location: vehicle.location,
  };
  const photoUrls = draft?.photoOrder.length
    ? draft.photoOrder
    : vehicle.photos.map((photo) => photo.url);

  let listing;
  try {
    listing = await withListingCreateLock(
      {
        organizationId: auth.orgId,
        userId: auth.sub,
        vehicleId: data.vehicleId,
        platform: data.platform,
      },
      async (tx, { ownActiveId }) => {
        if (ownActiveId) {
          const activeListing = await tx.listing.findFirst({
            where: { id: ownActiveId },
            include: {
              vehicle: { include: { photos: { take: 1 } } },
              user: { select: { id: true, name: true } },
            },
          });
          throw new ListingGuardError(
            409,
            "An active listing already exists for this vehicle and platform",
            { listing: activeListing },
          );
        }

        return tx.listing.create({
          data: {
            organizationId: auth.orgId,
            vehicleId: data.vehicleId,
            userId: auth.sub,
            platform: data.platform,
            externalUrl: data.externalUrl,
            externalId: data.externalId,
            priceAtListing: data.priceAtListing ?? vehicle.price,
            marketplacePrice: data.priceAtListing ?? vehicle.price,
            lastPriceConfirmedAt: new Date(),
            titleAtListing: draft?.title || generateMarketplaceTitle(vehicleData),
            descriptionAtListing:
              draft?.description || generateTemplateDescription(vehicleData),
            photoUrlsAtListing: photoUrls,
            notes: data.notes,
            events: {
              create: {
                eventType: "listing_created",
                metadata: { source: "dashboard" },
              },
            },
          },
          include: {
            vehicle: { include: { photos: { take: 1 } } },
            user: { select: { id: true, name: true } },
          },
        });
      },
    );
  } catch (err) {
    if (err instanceof ListingGuardError) {
      return jsonResponse({ error: err.message, ...err.extra }, err.status);
    }
    throw err;
  }

  await createAuditLog({
    organizationId: auth.orgId,
    userId: auth.sub,
    action: "LISTING",
    entityType: "listing",
    entityId: listing.id,
    request: request as never,
  });

  return jsonResponse(listing, 201);
});
