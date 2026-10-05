import { prisma } from "@okauto/database";
import {
  buildMetaVehicleCatalogCsv,
  classifyInventoryKind,
  computeQuebecAdvertisedPrice,
  DEFAULT_LISTING_RENEWAL_DAYS,
  getListingHealth,
  hoursSince,
  isListingDueForRenewal,
  mergePricingFees,
  remainingListingSlots,
  rankPublishCandidates,
  resolveListingLocale,
  resolveMonthlyListingLimit,
  scoreVehicleForToday,
  startOfCalendarMonth,
  startOfNextCalendarMonth,
  toMetaVehicleCatalogRow,
  validateMetaVehicleRow,
  type ListingLocale,
} from "@okauto/shared";

function money(value: unknown): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function advertisedForVehicle(
  vehicle: {
    price: unknown;
    freightFee: unknown;
    pdiFee: unknown;
    adminFee: unknown;
    acExciseFee: unknown;
  },
  organization: {
    freightFee: unknown;
    pdiFee: unknown;
    adminFee: unknown;
    acExciseFee: unknown;
  },
) {
  return computeQuebecAdvertisedPrice(
    vehicle.price == null ? null : money(vehicle.price),
    mergePricingFees(
      {
        freightFee: money(organization.freightFee),
        pdiFee: money(organization.pdiFee),
        adminFee: money(organization.adminFee),
        acExciseFee: money(organization.acExciseFee),
      },
      {
        freightFee: vehicle.freightFee == null ? null : money(vehicle.freightFee),
        pdiFee: vehicle.pdiFee == null ? null : money(vehicle.pdiFee),
        adminFee: vehicle.adminFee == null ? null : money(vehicle.adminFee),
        acExciseFee:
          vehicle.acExciseFee == null ? null : money(vehicle.acExciseFee),
      },
    ),
  );
}

export async function getPublishQueue(organizationId: string, userId: string) {
  const [organization, monthListings, vehicles, staleCount, activeListings, openLeads] =
    await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId } }),
      prisma.listing.count({
        where: {
          organizationId,
          userId,
          listedAt: { gte: startOfCalendarMonth() },
          status: { in: ["ACTIVE", "STALE", "REMOVED", "SOLD"] },
        },
      }),
      prisma.vehicle.findMany({
        where: {
          organizationId,
          status: "AVAILABLE",
          listings: { none: { status: "ACTIVE", userId } },
        },
        include: {
          photos: { where: { isPrimary: true }, take: 1 },
        },
        orderBy: { createdAt: "asc" },
        take: 120,
      }),
      prisma.listing.count({
        where: { organizationId, userId, status: "STALE" },
      }),
      prisma.listing.findMany({
        where: { organizationId, userId, status: "ACTIVE" },
        include: {
          vehicle: {
            select: {
              id: true,
              year: true,
              make: true,
              model: true,
              trim: true,
              stockNumber: true,
              price: true,
              photos: { where: { isPrimary: true }, take: 1 },
            },
          },
        },
        orderBy: { listedAt: "asc" },
      }),
      prisma.marketplaceLead.count({
        where: {
          organizationId,
          status: { in: ["NEW", "CONTACTED", "APPOINTMENT"] },
        },
      }),
    ]);

  const monthlyLimit = resolveMonthlyListingLimit({
    organizationMarketplaceLimit:
      organization?.marketplaceMonthlyVehicleLimit,
    organizationMonthlyLimit: organization?.monthlyListingLimit,
  });
  const renewalDays =
    organization?.listingRenewalDays ?? DEFAULT_LISTING_RENEWAL_DAYS;
  const remaining = remainingListingSlots(monthListings, monthlyLimit);
  const todayLimit = Math.min(5, Math.max(remaining, remaining === 0 ? 0 : 1));

  const ranked = rankPublishCandidates(
    vehicles.map((vehicle) => ({
      id: vehicle.id,
      createdAt: vehicle.createdAt,
      hasPhoto: vehicle.photos.length > 0,
      hasPrice: vehicle.price != null && money(vehicle.price) > 0,
      hasMileage: vehicle.mileage != null,
      kind: classifyInventoryKind({
        condition: vehicle.condition,
        mileage: vehicle.mileage,
        stockNumber: vehicle.stockNumber,
        sourceUrl: vehicle.sourceUrl,
      }),
    })),
    todayLimit || 5,
  );

  const rankedById = new Map(ranked.map((item) => [item.id, item]));
  const todayPicks = vehicles
    .filter((vehicle) => rankedById.has(vehicle.id))
    .map((vehicle) => {
      const scored = rankedById.get(vehicle.id)!;
      const breakdown = organization
        ? advertisedForVehicle(vehicle, organization)
        : null;
      return {
        id: vehicle.id,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        stockNumber: vehicle.stockNumber,
        vin: vehicle.vin,
        mileage: vehicle.mileage,
        price: vehicle.price == null ? null : money(vehicle.price),
        advertisedPrice: breakdown?.advertisedPrice ?? null,
        photoUrl: vehicle.photos[0]?.url ?? null,
        daysInStock: scored.daysInStock,
        score: scored.score,
        reasons: scored.reasons,
        createdAt: vehicle.createdAt,
      };
    })
    .sort((a, b) => b.score - a.score);

  const dueForRenewal = activeListings.filter((listing) =>
    isListingDueForRenewal(
      listing.listedAt,
      listing.lastRenewedAt,
      renewalDays,
    ),
  );

  return {
    monthlyLimit,
    usedThisMonth: monthListings,
    remainingThisMonth: remaining,
    listingRenewalDays: renewalDays,
    listingLocale: resolveListingLocale(organization?.listingLocale),
    staleCount,
    openLeadCount: openLeads,
    dueForRenewalCount: dueForRenewal.length,
    todayPicks: remaining === 0 ? [] : todayPicks.slice(0, todayLimit),
    dueForRenewal: dueForRenewal.map((listing) => ({
      id: listing.id,
      listedAt: listing.listedAt,
      lastRenewedAt: listing.lastRenewedAt,
      renewalCount: listing.renewalCount,
      externalUrl: listing.externalUrl,
      daysLive: Math.floor(
        (Date.now() -
          (listing.lastRenewedAt ?? listing.listedAt).getTime()) /
          86_400_000,
      ),
      vehicle: listing.vehicle,
    })),
  };
}

export async function getDirectorStats(organizationId: string) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthStart = startOfCalendarMonth();

  const [
    organization,
    members,
    vehicleCounts,
    listingGroups,
    agingWithoutListing,
    openLeads,
    leadsThisWeek,
    dueFollowUps,
  ] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.vehicle.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    }),
    prisma.listing.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    }),
    prisma.vehicle.findMany({
      where: {
        organizationId,
        status: "AVAILABLE",
        listings: { none: { status: "ACTIVE" } },
        createdAt: { lte: new Date(Date.now() - 21 * 86_400_000) },
      },
      select: {
        id: true,
        year: true,
        make: true,
        model: true,
        stockNumber: true,
        createdAt: true,
        price: true,
      },
      orderBy: { createdAt: "asc" },
      take: 12,
    }),
    prisma.marketplaceLead.count({
      where: {
        organizationId,
        status: { in: ["NEW", "CONTACTED", "APPOINTMENT"] },
      },
    }),
    prisma.marketplaceLead.count({
      where: { organizationId, createdAt: { gte: weekAgo } },
    }),
    prisma.marketplaceLead.count({
      where: {
        organizationId,
        status: { in: ["NEW", "CONTACTED", "APPOINTMENT"] },
        nextFollowUpAt: { lte: new Date() },
      },
    }),
  ]);

  const monthlyLimit = resolveMonthlyListingLimit({
    organizationMarketplaceLimit:
      organization?.marketplaceMonthlyVehicleLimit,
    organizationMonthlyLimit: organization?.monthlyListingLimit,
  });
  const renewalDays =
    organization?.listingRenewalDays ?? DEFAULT_LISTING_RENEWAL_DAYS;

  const memberIds = members.map((member) => member.userId);
  const [weekGroups, monthGroups, statusGroups, lastGroups] = await Promise.all([
    prisma.listing.groupBy({
      by: ["userId"],
      where: { organizationId, listedAt: { gte: weekAgo } },
      _count: { _all: true },
    }),
    prisma.listing.groupBy({
      by: ["userId"],
      where: { organizationId, listedAt: { gte: monthStart } },
      _count: { _all: true },
    }),
    prisma.listing.groupBy({
      by: ["userId", "status"],
      where: {
        organizationId,
        status: { in: ["ACTIVE", "STALE"] },
      },
      _count: { _all: true },
    }),
    memberIds.length === 0
      ? Promise.resolve(
          [] as Array<{ userId: string; _max: { listedAt: Date | null } }>,
        )
      : prisma.listing.groupBy({
          by: ["userId"],
          where: { organizationId, userId: { in: memberIds } },
          _max: { listedAt: true },
        }),
  ]);

  const weekByUser = Object.fromEntries(
    weekGroups.map((row) => [row.userId, row._count._all]),
  );
  const monthByUser = Object.fromEntries(
    monthGroups.map((row) => [row.userId, row._count._all]),
  );
  const lastByUser = Object.fromEntries(
    lastGroups.map((row) => [row.userId, row._max.listedAt]),
  );
  const statusByUser = new Map<string, { active: number; stale: number }>();
  for (const row of statusGroups) {
    const current = statusByUser.get(row.userId) ?? { active: 0, stale: 0 };
    if (row.status === "ACTIVE") current.active = row._count._all;
    if (row.status === "STALE") current.stale = row._count._all;
    statusByUser.set(row.userId, current);
  }

  const memberStats = members.map((member) => {
    const monthListings = monthByUser[member.userId] ?? 0;
    const memberLimit = resolveMonthlyListingLimit({
      memberLimit: member.marketplaceMonthlyVehicleLimit,
      organizationMarketplaceLimit:
        organization?.marketplaceMonthlyVehicleLimit,
      organizationMonthlyLimit: organization?.monthlyListingLimit,
    });
    const status = statusByUser.get(member.userId);
    return {
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      weekListings: weekByUser[member.userId] ?? 0,
      monthListings,
      remainingThisMonth: remainingListingSlots(monthListings, memberLimit),
      active: status?.active ?? 0,
      stale: status?.stale ?? 0,
      lastActivity: lastByUser[member.userId] ?? null,
    };
  });

  const countsByStatus = Object.fromEntries(
    vehicleCounts.map((row) => [row.status, row._count._all]),
  );
  const listingCounts = Object.fromEntries(
    listingGroups.map((row) => [row.status, row._count._all]),
  );

  const dueForRenewal = await prisma.listing.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: {
      id: true,
      listedAt: true,
      lastRenewedAt: true,
      user: { select: { name: true } },
      vehicle: {
        select: { year: true, make: true, model: true, stockNumber: true },
      },
    },
  });

  return {
    monthlyLimit,
    listingRenewalDays: renewalDays,
    listingLocale: resolveListingLocale(organization?.listingLocale),
    availableVehicles: countsByStatus.AVAILABLE ?? 0,
    soldVehicles: countsByStatus.SOLD ?? 0,
    activeListings: listingCounts.ACTIVE ?? 0,
    staleListings: listingCounts.STALE ?? 0,
    dueForRenewalCount: dueForRenewal.filter((listing) =>
      isListingDueForRenewal(
        listing.listedAt,
        listing.lastRenewedAt,
        renewalDays,
      ),
    ).length,
    openLeadCount: openLeads,
    leadsThisWeek,
    dueFollowUps,
    memberStats: memberStats.sort(
      (a, b) => b.monthListings - a.monthListings || b.weekListings - a.weekListings,
    ),
    agingWithoutListing: agingWithoutListing.map((vehicle) => ({
      ...vehicle,
      price: vehicle.price == null ? null : money(vehicle.price),
      daysInStock: Math.floor(
        (Date.now() - vehicle.createdAt.getTime()) / 86_400_000,
      ),
    })),
    dueForRenewal: dueForRenewal
      .filter((listing) =>
        isListingDueForRenewal(
          listing.listedAt,
          listing.lastRenewedAt,
          renewalDays,
        ),
      )
      .slice(0, 12)
      .map((listing) => ({
        id: listing.id,
        listedAt: listing.listedAt,
        lastRenewedAt: listing.lastRenewedAt,
        salesperson: listing.user.name,
        vehicle: listing.vehicle,
      })),
  };
}

export async function buildOrganizationCatalogCsv(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });
  if (!organization) throw new Error("Organization not found");

  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId, status: { in: ["AVAILABLE", "PENDING"] } },
    include: {
      photos: { orderBy: { sortOrder: "asc" }, take: 20 },
    },
    orderBy: [{ make: "asc" }, { model: "asc" }, { year: "desc" }],
  });

  const dealer = {
    name: organization.name,
    phone: organization.phone,
    website: organization.website,
    address: organization.address,
    city: organization.city,
    state: organization.state,
    zip: organization.zip,
    metaCatalogStateForDemo: organization.metaCatalogStateForDemo,
  };

  return buildMetaVehicleCatalogCsv(
    vehicles.map((vehicle) => {
      const breakdown = advertisedForVehicle(vehicle, organization);
      return {
        id: vehicle.id,
        vin: vehicle.vin,
        stockNumber: vehicle.stockNumber,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        mileage: vehicle.mileage,
        advertisedPrice: breakdown?.advertisedPrice ?? null,
        price: vehicle.price == null ? null : money(vehicle.price),
        bodyStyle: vehicle.bodyStyle,
        exteriorColor: vehicle.exteriorColor,
        interiorColor: vehicle.interiorColor,
        condition: vehicle.condition,
        description: vehicle.description,
        sourceUrl: vehicle.sourceUrl,
        imageUrl: vehicle.photos[0]?.url ?? null,
        imageUrls: vehicle.photos.map((photo) => photo.url),
        status: vehicle.status,
        transmission: vehicle.transmission,
        fuelType: vehicle.fuelType,
        drivetrain: vehicle.drivetrain,
        createdAt: vehicle.createdAt,
      };
    }),
    dealer,
  );
}

export async function getTodayQueue(organizationId: string, userId: string) {
  const [organization, membership, monthListings, vehicles] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.organizationMember.findFirst({
      where: { organizationId, userId },
    }),
    prisma.listing.findMany({
      where: {
        organizationId,
        userId,
        platform: "facebook_marketplace",
        listedAt: { gte: startOfCalendarMonth() },
      },
      select: { id: true },
    }),
    prisma.vehicle.findMany({
      where: { organizationId, status: "AVAILABLE" },
      include: {
        photos: { orderBy: { sortOrder: "asc" } },
        listings: {
          where: { status: "ACTIVE" },
          include: { user: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
  ]);

  const monthlyLimit = resolveMonthlyListingLimit({
    memberLimit: membership?.marketplaceMonthlyVehicleLimit,
    organizationMarketplaceLimit:
      organization?.marketplaceMonthlyVehicleLimit,
    organizationMonthlyLimit: organization?.monthlyListingLimit,
  });
  const used = monthListings.length;
  const remaining =
    monthlyLimit == null ? null : remainingListingSlots(used, monthlyLimit);

  const suggestions: Array<{
    vehicle: Record<string, unknown>;
    score: number;
    reasons: string[];
    alreadyListedBy: Array<{ name: string }>;
  }> = [];
  const excluded: Array<{ vehicleId: string; reason: string }> = [];

  for (const vehicle of vehicles) {
    const others = vehicle.listings.filter((listing) => listing.userId !== userId);
    const blockers: string[] = [];
    if (vehicle.price == null) blockers.push("Prix de vente requis.");
    const scored = scoreVehicleForToday({
      createdAt: vehicle.createdAt,
      price: vehicle.price == null ? null : money(vehicle.price),
      priceDroppedAt: vehicle.priceDroppedAt,
      managerPriority: vehicle.managerPriority,
      managerPriorityNote: vehicle.managerPriorityNote,
      photoCount: vehicle.photos.length,
      activeListingsByOthers: others.length,
      alreadyListedByNames: others.map((listing) => listing.user.name),
      blockers,
    });
    if (scored.excludedReason) {
      if (excluded.length < 20) {
        excluded.push({ vehicleId: vehicle.id, reason: scored.excludedReason });
      }
      continue;
    }
    suggestions.push({
      vehicle: {
        id: vehicle.id,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        stockNumber: vehicle.stockNumber,
        vin: vehicle.vin,
        mileage: vehicle.mileage,
        price: vehicle.price == null ? null : money(vehicle.price),
        photoUrl: vehicle.photos[0]?.url ?? null,
        createdAt: vehicle.createdAt,
        managerPriority: vehicle.managerPriority,
      },
      score: scored.score,
      reasons: scored.reasons,
      alreadyListedBy: others.map((listing) => ({ name: listing.user.name })),
    });
  }

  suggestions.sort((a, b) => b.score - a.score);

  return {
    quota: {
      limit: monthlyLimit,
      used,
      remaining: remaining ?? 0,
      resetsAt: startOfNextCalendarMonth().toISOString(),
    },
    suggestions: suggestions.slice(0, 20),
    excluded,
  };
}

export function listingHealthPayload(listing: {
  status: string;
  priceAtListing: unknown;
  marketplacePrice?: unknown;
  listedAt: Date;
  lastRenewedAt?: Date | null;
  staleSince?: Date | null;
  vehicle: { price: unknown };
}) {
  const health = getListingHealth({
    status: listing.status,
    vehiclePrice: listing.vehicle.price == null ? null : money(listing.vehicle.price),
    marketplacePrice:
      listing.marketplacePrice == null ? null : money(listing.marketplacePrice),
    priceAtListing:
      listing.priceAtListing == null ? null : money(listing.priceAtListing),
    listedAt: listing.listedAt,
    lastRenewedAt: listing.lastRenewedAt,
  });
  return {
    ...health,
    hoursStale: hoursSince(listing.staleSince),
  };
}

export async function previewMetaCatalog(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });
  if (!organization) throw new Error("Organization not found");
  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId, status: "AVAILABLE" },
    include: { photos: { orderBy: { sortOrder: "asc" }, take: 20 } },
  });
  const dealer = {
    name: organization.name,
    phone: organization.phone,
    website: organization.website,
    address: organization.address,
    city: organization.city,
    state: organization.state,
    zip: organization.zip,
    metaCatalogStateForDemo: organization.metaCatalogStateForDemo,
  };
  const included: string[] = [];
  const excluded: Array<{ vehicleId: string; title: string; reasons: string[] }> = [];
  const warnings: Array<{ vehicleId: string; warnings: string[] }> = [];
  const sampleRows: Array<Record<string, string>> = [];

  for (const vehicle of vehicles) {
    const breakdown = advertisedForVehicle(vehicle, organization);
    const row = toMetaVehicleCatalogRow(
      {
        id: vehicle.id,
        vin: vehicle.vin,
        stockNumber: vehicle.stockNumber,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        mileage: vehicle.mileage,
        advertisedPrice: breakdown?.advertisedPrice ?? null,
        price: vehicle.price == null ? null : money(vehicle.price),
        bodyStyle: vehicle.bodyStyle,
        exteriorColor: vehicle.exteriorColor,
        interiorColor: vehicle.interiorColor,
        condition: vehicle.condition,
        description: vehicle.description,
        sourceUrl: vehicle.sourceUrl,
        imageUrls: vehicle.photos.map((photo) => photo.url),
        status: vehicle.status,
        transmission: vehicle.transmission,
        fuelType: vehicle.fuelType,
        drivetrain: vehicle.drivetrain,
        createdAt: vehicle.createdAt,
      },
      dealer,
    );
    const check = validateMetaVehicleRow(row);
    const title = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
    if (check.excluded.length) {
      excluded.push({ vehicleId: vehicle.id, title, reasons: check.excluded });
      continue;
    }
    included.push(vehicle.id);
    if (check.warnings.length) {
      warnings.push({ vehicleId: vehicle.id, warnings: check.warnings });
    }
    if (sampleRows.length < 3) sampleRows.push(row);
  }

  return {
    included: included.length,
    excluded,
    warnings,
    sampleRows,
  };
}

export function organizationLocale(value?: string | null): ListingLocale {
  return resolveListingLocale(value);
}
