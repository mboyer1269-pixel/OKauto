import { PrismaClient, Role, VehicleStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { slugify } from "@okauto/shared";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("DemoPass123!", 12);

  const owner = await prisma.user.upsert({
    where: { email: "owner@demo.okauto.local" },
    update: {},
    create: {
      email: "owner@demo.okauto.local",
      name: "Dana Owner",
      passwordHash,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@demo.okauto.local" },
    update: {},
    create: {
      email: "manager@demo.okauto.local",
      name: "Morgan Manager",
      passwordHash,
    },
  });

  const sales = await prisma.user.upsert({
    where: { email: "sales@demo.okauto.local" },
    update: {},
    create: {
      email: "sales@demo.okauto.local",
      name: "Sam Sales",
      passwordHash,
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "demo-motors" },
    update: {},
    create: {
      name: "Demo Motors",
      slug: slugify("Demo Motors"),
      settings: {
        timezone: "America/Chicago",
        defaultListingTone: "professional",
        marketplaceCity: "Austin",
      },
    },
  });

  const memberships: Array<{ userId: string; role: Role }> = [
    { userId: owner.id, role: "owner" },
    { userId: manager.id, role: "manager" },
    { userId: sales.id, role: "salesperson" },
  ];

  for (const m of memberships) {
    await prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: m.userId,
          organizationId: org.id,
        },
      },
      update: { role: m.role, status: "active" },
      create: {
        userId: m.userId,
        organizationId: org.id,
        role: m.role,
        status: "active",
      },
    });
  }

  const source = await prisma.inventorySource.upsert({
    where: { id: "seed-manual-source" },
    update: {},
    create: {
      id: "seed-manual-source",
      organizationId: org.id,
      name: "Demo Manual Inventory",
      type: "manual",
      health: "healthy",
      lastSyncAt: new Date(),
      lastSuccessAt: new Date(),
    },
  });

  const vehicles = [
    {
      vin: "1HGCM82633A004352",
      stockNumber: "A1001",
      year: 2021,
      make: "Honda",
      model: "Accord",
      trim: "Sport",
      priceCents: 2299000,
      mileage: 28500,
      exteriorColor: "Crystal Black Pearl",
      transmission: "CVT",
      fuelType: "Gasoline",
      drivetrain: "FWD",
      photoUrls: [
        "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1200",
      ],
      status: VehicleStatus.available,
    },
    {
      vin: "5YJSA1E26HF000001",
      stockNumber: "A1002",
      year: 2020,
      make: "Tesla",
      model: "Model S",
      trim: "Long Range",
      priceCents: 4499000,
      mileage: 41200,
      exteriorColor: "Pearl White",
      transmission: "Automatic",
      fuelType: "Electric",
      drivetrain: "AWD",
      photoUrls: [
        "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=1200",
      ],
      status: VehicleStatus.available,
    },
    {
      vin: "1FTFW1E50MFA00001",
      stockNumber: "A1003",
      year: 2022,
      make: "Ford",
      model: "F-150",
      trim: "XLT",
      priceCents: 3899000,
      mileage: 19800,
      exteriorColor: "Antimatter Blue",
      transmission: "Automatic",
      fuelType: "Gasoline",
      drivetrain: "4WD",
      photoUrls: [
        "https://images.unsplash.com/photo-1605893477799-b4c4c8610fad?w=1200",
      ],
      status: VehicleStatus.listed,
    },
    {
      vin: "2T1BURHE0JC000001",
      stockNumber: "A1004",
      year: 2018,
      make: "Toyota",
      model: "Corolla",
      trim: "LE",
      priceCents: 1499000,
      mileage: 67000,
      exteriorColor: "Super White",
      transmission: "Automatic",
      fuelType: "Gasoline",
      drivetrain: "FWD",
      photoUrls: [
        "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=1200",
      ],
      status: VehicleStatus.sold,
    },
    {
      vin: "3VW2B7AJ5HM000001",
      stockNumber: "A1005",
      year: 2019,
      make: "Volkswagen",
      model: "Jetta",
      trim: "SE",
      priceCents: 1699000,
      mileage: 52000,
      exteriorColor: "Pure White",
      transmission: "Automatic",
      fuelType: "Gasoline",
      drivetrain: "FWD",
      photoUrls: [
        "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=1200",
      ],
      status: VehicleStatus.available,
    },
  ];

  for (const v of vehicles) {
    await prisma.vehicle.upsert({
      where: {
        organizationId_vin: {
          organizationId: org.id,
          vin: v.vin,
        },
      },
      update: { ...v, sourceId: source.id },
      create: {
        organizationId: org.id,
        sourceId: source.id,
        ...v,
        description: `${v.year} ${v.make} ${v.model} ${v.trim} — Demo Motors inventory.`,
      },
    });
  }

  const listed = await prisma.vehicle.findFirst({
    where: { organizationId: org.id, stockNumber: "A1003" },
  });
  if (listed) {
    const existing = await prisma.listing.findFirst({
      where: { vehicleId: listed.id, userId: sales.id },
    });
    if (!existing) {
      const listing = await prisma.listing.create({
        data: {
          organizationId: org.id,
          vehicleId: listed.id,
          userId: sales.id,
          channel: "marketplace",
          status: "posted",
          title: `${listed.year} ${listed.make} ${listed.model} ${listed.trim}`,
          description: listed.description ?? "Posted demo listing",
          priceCents: listed.priceCents,
          postedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
      });
      await prisma.listingEvent.create({
        data: {
          listingId: listing.id,
          type: "posted",
          meta: { channel: "marketplace", demo: true },
        },
      });
    }
  }

  const sold = await prisma.vehicle.findFirst({
    where: { organizationId: org.id, stockNumber: "A1004" },
  });
  if (sold) {
    await prisma.notification.create({
      data: {
        organizationId: org.id,
        userId: sales.id,
        type: "vehicle_sold",
        title: "Vehicle sold — remove Marketplace listing",
        body: `${sold.year} ${sold.make} ${sold.model} (Stock ${sold.stockNumber}) was marked sold. Please remove any active Marketplace posts.`,
        meta: { vehicleId: sold.id },
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      actorId: owner.id,
      action: "seed.completed",
      entity: "organization",
      entityId: org.id,
      meta: { demo: true },
    },
  });

  console.log("Seed complete.");
  console.log("Demo logins (password: DemoPass123!):");
  console.log("  owner@demo.okauto.local");
  console.log("  manager@demo.okauto.local");
  console.log("  sales@demo.okauto.local");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
