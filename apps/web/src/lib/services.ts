import { prisma } from "@okauto/database";
import {
  carfaxMentionEn,
  carfaxMentionFr,
  classifyInventoryKind,
  composeListingDescription,
  ensureCarfaxMention,
  generateTemplateDescriptionEn,
  mergePricingFees,
  resolveIncludeCarfaxSourceUrl,
  listingNeedsMarketplaceRemovalWhere,
  onSaleVehicleWhere,
  resolveListingLocale,
  type ListingLocale,
} from "@okauto/shared";

export async function generateVehicleDescription(
  vehicleId: string,
  organizationId: string,
  userId?: string,
  locale?: ListingLocale,
): Promise<{
  description: string;
  descriptionEn: string;
  locale: ListingLocale;
  source: "ai" | "template";
}> {
  const [vehicle, salesperson] = await Promise.all([
    prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      include: { organization: true },
    }),
    userId
      ? prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        })
      : null,
  ]);

  if (!vehicle) throw new Error("Vehicle not found");

  const contactName =
    salesperson?.name?.trim() ||
    process.env.MARKETPLACE_CONTACT_NAME?.trim() ||
    process.env.NEXT_PUBLIC_MARKETPLACE_CONTACT_NAME?.trim() ||
    "Michael Boyer";
  const resolvedLocale = resolveListingLocale(
    locale ??
      vehicle.organization.listingLanguage ??
      vehicle.organization.listingLocale,
  );
  const highlightsByKind = (vehicle.organization.listingHighlights ?? {}) as {
    NEW?: { fr?: string; en?: string };
    USED?: { fr?: string; en?: string };
    DEMO?: { fr?: string; en?: string };
  };
  const fees = mergePricingFees(
    {
      freightFee: Number(vehicle.organization.freightFee ?? 0),
      pdiFee: Number(vehicle.organization.pdiFee ?? 0),
      adminFee: Number(vehicle.organization.adminFee ?? 0),
      acExciseFee: Number(vehicle.organization.acExciseFee ?? 0),
    },
    {
      freightFee: vehicle.freightFee == null ? null : Number(vehicle.freightFee),
      pdiFee: vehicle.pdiFee == null ? null : Number(vehicle.pdiFee),
      adminFee: vehicle.adminFee == null ? null : Number(vehicle.adminFee),
      acExciseFee:
        vehicle.acExciseFee == null ? null : Number(vehicle.acExciseFee),
    },
  );
  const inventoryType = classifyInventoryKind({
    condition: vehicle.condition,
    mileage: vehicle.mileage,
    stockNumber: vehicle.stockNumber,
    sourceUrl: vehicle.sourceUrl,
  });
  const vehicleData = {
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    mileage: vehicle.mileage,
    price: vehicle.price ? Number(vehicle.price) : null,
    organizationFees: fees,
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
    contactName,
    phone: vehicle.organization.phone ?? undefined,
    vin: vehicle.vin,
    stockNumber: vehicle.stockNumber,
    sourceUrl: vehicle.sourceUrl,
    includeCarfaxSourceUrl: resolveIncludeCarfaxSourceUrl(
      vehicle.organization.includeCarfaxSourceUrl,
      vehicle.includeCarfaxSourceUrl,
    ),
    location: vehicle.location,
    language:
      resolvedLocale === "bilingual"
        ? ("fr_en" as const)
        : resolvedLocale === "en"
          ? undefined
          : ("fr" as const),
    allInPriceConfirmed: Boolean(vehicle.organization.allInPriceConfirmedAt),
    highlights:
      inventoryType === "new"
        ? highlightsByKind.NEW
        : inventoryType === "demo"
          ? highlightsByKind.DEMO
          : highlightsByKind.USED,
  };

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  resolvedLocale === "en"
                    ? "You are an excellent Quebec automotive advisor writing in Canadian English. Write a first-person Facebook Marketplace listing, 140-240 words, specific and scannable. Never invent equipment, warranties, rates or discounts. Show the advertised all-in CAD price (before GST, QST and the Quebec new-tire fee). If a Carfax line is provided, include it verbatim and do not add any other URL. End by asking the shopper to message the advisor on Messenger. Return only the listing text."
                    : "Tu es un excellent conseiller automobile québécois. Rédige à la première personne une annonce Facebook Marketplace humaine, précise et facile à parcourir, entre 140 et 240 mots. Commence par une accroche spécifique au véhicule, puis explique sa configuration et ses équipements les plus pertinents avec de courtes phrases et quelques puces. N’utilise aucun cliché vide et ne répète pas deux fois la même information. N’invente jamais une garantie, une certification, un rabais, un taux, une capacité, une performance ni un équipement. Affiche clairement le prix annoncé tout inclus en dollars canadiens (avant TPS, TVQ et droit sur les pneus neufs) et le kilométrage en km. Si une mention Carfax est fournie, inclus-la telle quelle, sans ajouter d’autre lien. Termine en demandant au client d’écrire directement au conseiller sur Messenger ou d’appeler la concession et de demander ce conseiller. Précise que seules la TPS, la TVQ et le droit sur les pneus neufs peuvent s’ajouter. Retourne seulement le texte final de l’annonce.",
              },
              {
                role: "user",
                content: `Données autorisées : ${JSON.stringify({
                  year: vehicle.year,
                  make: vehicle.make,
                  model: vehicle.model,
                  trim: vehicle.trim,
                  inventoryType,
                  bodyStyle: vehicle.bodyStyle,
                  mileageKm: vehicle.mileage,
                  priceCad: vehicle.price ? Number(vehicle.price) : null,
                  exteriorColor: vehicle.exteriorColor,
                  interiorColor: vehicle.interiorColor,
                  transmission: vehicle.transmission,
                  fuelType: vehicle.fuelType,
                  drivetrain: vehicle.drivetrain,
                  engine: vehicle.engine,
                  features: vehicle.features,
                  stockNumber: vehicle.stockNumber,
                  vin: vehicle.vin,
                  location: vehicle.location,
                  dealership: vehicle.organization.name,
                  contactName,
                  phone: vehicle.organization.phone,
                  carfaxLine:
                    resolvedLocale === "en"
                      ? carfaxMentionEn(vehicleData)
                      : carfaxMentionFr(vehicleData),
                })}`,
              },
            ],
            max_tokens: 600,
            temperature: 0.7,
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const descriptionEn = generateTemplateDescriptionEn(vehicleData);
          const french = ensureCarfaxMention(content, vehicleData, "fr");
          return {
            description:
              resolvedLocale === "bilingual"
                ? `${french}\n\n————————\nEnglish\n————————\n\n${descriptionEn}`
                : resolvedLocale === "en"
                  ? ensureCarfaxMention(content, vehicleData, "en")
                  : french,
            descriptionEn,
            locale: resolvedLocale,
            source: "ai",
          };
        }
      }
    } catch (err) {
      console.warn("OpenAI generation failed, using template:", err);
    }
  }

  return {
    description: composeListingDescription(vehicleData, resolvedLocale),
    descriptionEn: generateTemplateDescriptionEn(vehicleData),
    locale: resolvedLocale,
    source: "template",
  };
}

export async function notifySoldVehicle(
  vehicleId: string,
  organizationId: string,
) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    include: {
      listings: {
        where: { status: "ACTIVE" },
        include: { user: true },
      },
    },
  });

  if (!vehicle) return;

  const userIds = new Set<string>();
  for (const listing of vehicle.listings) {
    userIds.add(listing.userId);
  }
  if (vehicle.assignedToId) {
    userIds.add(vehicle.assignedToId);
  }

  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  for (const userId of userIds) {
    await prisma.notification.create({
      data: {
        userId,
        type: "SOLD_ALERT",
        title: "Véhicule vendu : retirez votre annonce",
        message: `Le ${title} (stock ${vehicle.stockNumber ?? "s. o."}) n’est plus dans l’inventaire. Retirez l’annonce sur Facebook, puis confirmez le retrait dans Suivia.`,
        metadata: { vehicleId: vehicle.id, stockNumber: vehicle.stockNumber },
      },
    });
  }

  await prisma.listing.updateMany({
    where: { vehicleId, status: "ACTIVE" },
    data: { status: "STALE", staleSince: new Date() },
  });
}

export async function confirmFeedAbsenceVehicles(
  organizationId: string,
  vehicleIds: string[],
  action: "sold" | "keep",
) {
  const vehicles = await prisma.vehicle.findMany({
    where: {
      organizationId,
      id: { in: vehicleIds },
      status: { in: ["AVAILABLE", "PENDING"] },
      feedAbsenceStatus: "PENDING_REVIEW",
    },
    select: { id: true },
  });
  const ids = vehicles.map((vehicle) => vehicle.id);
  if (ids.length === 0) return { updated: 0 };

  if (action === "keep") {
    await prisma.vehicle.updateMany({
      where: { id: { in: ids } },
      data: {
        feedAbsenceStatus: "KEPT",
        feedAbsenceNotedAt: new Date(),
      },
    });
    return { updated: ids.length };
  }

  const soldAt = new Date();
  await prisma.vehicle.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "SOLD",
      soldAt,
      feedAbsenceStatus: "IN_FEED",
      missingSyncCount: 0,
    },
  });
  for (const id of ids) {
    await notifySoldVehicle(id, organizationId);
  }
  return { updated: ids.length };
}

export async function getDashboardStats(
  organizationId: string,
  userId: string,
) {
  const [
    totalVehicles,
    availableVehicles,
    soldVehicles,
    activeListings,
    staleListings,
    readyToList,
    members,
    syncSources,
    pendingFeedReview,
    listingsToRemove,
  ] = await Promise.all([
    prisma.vehicle.count({
      where: { organizationId, ...onSaleVehicleWhere() },
    }),
    prisma.vehicle.count({
      where: {
        organizationId,
        ...onSaleVehicleWhere(),
        status: "AVAILABLE",
      },
    }),
    prisma.vehicle.count({ where: { organizationId, status: "SOLD" } }),
    prisma.listing.count({
      where: { organizationId, userId, status: "ACTIVE" },
    }),
    prisma.listing.count({
      where: { organizationId, userId, status: "STALE" },
    }),
    prisma.vehicle.count({
      where: {
        organizationId,
        ...onSaleVehicleWhere(),
        listings: { none: { status: "ACTIVE", userId } },
      },
    }),
    prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.syncSource.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        lastSyncError: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.vehicle.count({
      where: {
        organizationId,
        status: { in: ["AVAILABLE", "PENDING"] },
        feedAbsenceStatus: "PENDING_REVIEW",
      },
    }),
    prisma.listing.findMany({
      where: {
        organizationId,
        userId,
        ...listingNeedsMarketplaceRemovalWhere(),
      },
      select: {
        id: true,
        externalUrl: true,
        vehicle: {
          select: {
            id: true,
            year: true,
            make: true,
            model: true,
            stockNumber: true,
            status: true,
            feedAbsenceStatus: true,
          },
        },
      },
      orderBy: { listedAt: "asc" },
      take: 25,
    }),
  ]);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const listingsThisWeek = await prisma.listing.count({
    where: { organizationId, userId, listedAt: { gte: weekAgo } },
  });

  const memberStats = await Promise.all(
    members.map(async (m) => {
      const [totalListings, weekListings, monthListings] = await Promise.all([
        prisma.listing.count({ where: { organizationId, userId: m.userId } }),
        prisma.listing.count({
          where: {
            organizationId,
            userId: m.userId,
            listedAt: { gte: weekAgo },
          },
        }),
        prisma.listing.count({
          where: {
            organizationId,
            userId: m.userId,
            listedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        }),
      ]);

      const lastListing = await prisma.listing.findFirst({
        where: { organizationId, userId: m.userId },
        orderBy: { listedAt: "desc" },
        select: { listedAt: true },
      });

      return {
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        totalListings,
        weekListings,
        monthListings,
        lastActivity: lastListing?.listedAt ?? null,
      };
    }),
  );

  return {
    totalVehicles,
    availableVehicles,
    soldVehicles,
    activeListings,
    staleListings,
    readyToList,
    listingsThisWeek,
    pendingFeedReview,
    listingsToRemove,
    syncSources,
    memberStats,
  };
}
