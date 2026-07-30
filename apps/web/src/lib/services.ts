import { prisma } from '@okauto/database';
import { generateTemplateDescription } from '@okauto/shared';

export async function generateVehicleDescription(
  vehicleId: string,
  organizationId: string
): Promise<string> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    include: { organization: true },
  });

  if (!vehicle) throw new Error('Vehicle not found');

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You write concise, compliant Facebook Marketplace vehicle listing descriptions for dealerships. No misleading claims. Include key specs. Max 500 words.',
            },
            {
              role: 'user',
              content: `Write a listing description for: ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim ?? ''}, ${vehicle.mileage?.toLocaleString()} miles, ${vehicle.exteriorColor} exterior, ${vehicle.transmission}, ${vehicle.fuelType}. Price: $${vehicle.price}. Dealership: ${vehicle.organization.name}.`,
            },
          ],
          max_tokens: 600,
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch (err) {
      console.warn('OpenAI generation failed, using template:', err);
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
    phone: vehicle.organization.phone ?? undefined,
  });
}

export async function notifySoldVehicle(vehicleId: string, organizationId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    include: {
      listings: {
        where: { status: 'ACTIVE' },
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
        type: 'SOLD_ALERT',
        title: 'Vehicle Sold — Remove Listing',
        message: `The ${title} (Stock ${vehicle.stockNumber ?? 'N/A'}) has been marked as sold. Please remove it from Facebook Marketplace.`,
        metadata: { vehicleId: vehicle.id, stockNumber: vehicle.stockNumber },
      },
    });
  }

  await prisma.listing.updateMany({
    where: { vehicleId, status: 'ACTIVE' },
    data: { status: 'STALE' },
  });
}

export async function getDashboardStats(organizationId: string) {
  const [totalVehicles, availableVehicles, soldVehicles, activeListings, staleListings, members] =
    await Promise.all([
      prisma.vehicle.count({ where: { organizationId } }),
      prisma.vehicle.count({ where: { organizationId, status: 'AVAILABLE' } }),
      prisma.vehicle.count({ where: { organizationId, status: 'SOLD' } }),
      prisma.listing.count({ where: { organizationId, status: 'ACTIVE' } }),
      prisma.listing.count({ where: { organizationId, status: 'STALE' } }),
      prisma.organizationMember.findMany({
        where: { organizationId },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const listingsThisWeek = await prisma.listing.count({
    where: { organizationId, listedAt: { gte: weekAgo } },
  });

  const memberStats = await Promise.all(
    members.map(async (m) => {
      const [totalListings, weekListings, monthListings] = await Promise.all([
        prisma.listing.count({ where: { organizationId, userId: m.userId } }),
        prisma.listing.count({
          where: { organizationId, userId: m.userId, listedAt: { gte: weekAgo } },
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
        orderBy: { listedAt: 'desc' },
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
    })
  );

  return {
    totalVehicles,
    availableVehicles,
    soldVehicles,
    activeListings,
    staleListings,
    listingsThisWeek,
    memberStats,
  };
}
