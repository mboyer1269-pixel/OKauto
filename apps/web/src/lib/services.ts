import { prisma } from "@okauto/database";
import {
  classifyInventoryKind,
  generateTemplateDescription,
} from "@okauto/shared";

export async function generateVehicleDescription(
  vehicleId: string,
  organizationId: string,
  userId?: string,
): Promise<string> {
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
  const inventoryType = classifyInventoryKind({
    condition: vehicle.condition,
    mileage: vehicle.mileage,
    stockNumber: vehicle.stockNumber,
    sourceUrl: vehicle.sourceUrl,
  });

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
                  "Tu es un excellent conseiller automobile québécois. Rédige à la première personne une annonce Facebook Marketplace humaine, précise et facile à parcourir, entre 140 et 240 mots. Commence par une accroche spécifique au véhicule, puis explique sa configuration et ses équipements les plus pertinents avec de courtes phrases et quelques puces. N’utilise aucun cliché vide et ne répète pas deux fois la même information. N’invente jamais une garantie, une certification, un rabais, un taux, une capacité, une performance ni un équipement. Affiche clairement le prix en dollars canadiens et le kilométrage en km. Termine en demandant au client d’écrire directement au conseiller sur Messenger ou d’appeler la concession et de demander ce conseiller. Précise que seules la TPS, la TVQ et le droit sur les pneus neufs peuvent s’ajouter. Retourne seulement le texte final de l’annonce.",
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
        if (content) return content;
      }
    } catch (err) {
      console.warn("OpenAI generation failed, using template:", err);
    }
  }

  return generateTemplateDescription({
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
    contactName,
    phone: vehicle.organization.phone ?? undefined,
    vin: vehicle.vin,
    stockNumber: vehicle.stockNumber,
    sourceUrl: vehicle.sourceUrl,
    location: vehicle.location,
  });
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
        title: "Vehicle Sold — Remove Listing",
        message: `The ${title} (Stock ${vehicle.stockNumber ?? "N/A"}) has been marked as sold. Please remove it from Facebook Marketplace.`,
        metadata: { vehicleId: vehicle.id, stockNumber: vehicle.stockNumber },
      },
    });
  }

  await prisma.listing.updateMany({
    where: { vehicleId, status: "ACTIVE" },
    data: { status: "STALE" },
  });
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
  ] = await Promise.all([
    prisma.vehicle.count({ where: { organizationId } }),
    prisma.vehicle.count({ where: { organizationId, status: "AVAILABLE" } }),
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
        status: "AVAILABLE",
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
    syncSources,
    memberStats,
  };
}
