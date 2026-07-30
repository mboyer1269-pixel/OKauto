import { PrismaClient, Role, VehicleStatus } from "@prisma/client";
import argon2 from "argon2";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

function contentHash(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

async function main() {
  await prisma.listingEvent.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.descriptionCache.deleteMany();
  await prisma.vehicleMedia.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.inventorySource.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.extensionToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.jobRun.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.session.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await argon2.hash("DemoPass123!", {
    type: argon2.argon2id,
  });

  const owner = await prisma.user.create({
    data: {
      email: "owner@demo.okauto.local",
      name: "Dana Owner",
      passwordHash,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: "manager@demo.okauto.local",
      name: "Morgan Manager",
      passwordHash,
    },
  });

  const sales1 = await prisma.user.create({
    data: {
      email: "alex@demo.okauto.local",
      name: "Alex Sales",
      passwordHash,
    },
  });

  const sales2 = await prisma.user.create({
    data: {
      email: "sam@demo.okauto.local",
      name: "Sam Sales",
      passwordHash,
    },
  });

  const org = await prisma.organization.create({
    data: {
      name: "Horizon Motors Demo",
      slug: "horizon-motors",
      timezone: "America/Chicago",
      settings: {
        defaultLocation: "Austin, TX",
        marketplaceDefaults: {
          condition: "Used - Good",
          availability: "In stock",
        },
      },
    },
  });

  const memberships: Array<{ userId: string; role: Role }> = [
    { userId: owner.id, role: "OWNER" },
    { userId: manager.id, role: "MANAGER" },
    { userId: sales1.id, role: "SALESPERSON" },
    { userId: sales2.id, role: "SALESPERSON" },
  ];

  for (const m of memberships) {
    await prisma.membership.create({
      data: { orgId: org.id, userId: m.userId, role: m.role, status: "ACTIVE" },
    });
  }

  const source = await prisma.inventorySource.create({
    data: {
      orgId: org.id,
      name: "Demo CSV Lot Feed",
      type: "CSV_UPLOAD",
      health: "HEALTHY",
      lastSyncAt: new Date(),
      config: { filename: "demo-inventory.csv" },
    },
  });

  const vehicles = [
    {
      stockNumber: "H1001",
      vin: "1HGCM82633A004352",
      year: 2021,
      make: "Honda",
      model: "Accord",
      trim: "Sport",
      priceCents: 2399900,
      mileage: 28450,
      bodyStyle: "Sedan",
      exteriorColor: "Crystal Black",
      drivetrain: "FWD",
      transmission: "Automatic",
      fuelType: "Gasoline",
      status: "AVAILABLE" as VehicleStatus,
      photos: [
        "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1200",
        "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1200",
      ],
    },
    {
      stockNumber: "H1002",
      vin: "5YJ3E1EA7KF123456",
      year: 2019,
      make: "Tesla",
      model: "Model 3",
      trim: "Long Range",
      priceCents: 2895000,
      mileage: 41200,
      bodyStyle: "Sedan",
      exteriorColor: "Pearl White",
      drivetrain: "AWD",
      transmission: "Automatic",
      fuelType: "Electric",
      status: "AVAILABLE" as VehicleStatus,
      photos: [
        "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=1200",
      ],
    },
    {
      stockNumber: "H1003",
      vin: "1FTFW1E50MFA12345",
      year: 2021,
      make: "Ford",
      model: "F-150",
      trim: "XLT",
      priceCents: 3699000,
      mileage: 35600,
      bodyStyle: "Truck",
      exteriorColor: "Oxford White",
      drivetrain: "4WD",
      transmission: "Automatic",
      fuelType: "Gasoline",
      status: "AVAILABLE" as VehicleStatus,
      photos: [
        "https://images.unsplash.com/photo-1605893477799-b99e3b8b93c0?w=1200",
      ],
    },
    {
      stockNumber: "H1004",
      vin: "JM1BL1SF5A1234567",
      year: 2018,
      make: "Mazda",
      model: "CX-5",
      trim: "Touring",
      priceCents: 1899000,
      mileage: 62300,
      bodyStyle: "SUV",
      exteriorColor: "Soul Red",
      drivetrain: "AWD",
      transmission: "Automatic",
      fuelType: "Gasoline",
      status: "AVAILABLE" as VehicleStatus,
      photos: [
        "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=1200",
      ],
    },
    {
      stockNumber: "H1005",
      vin: "2T3ZF4DVXAW123456",
      year: 2020,
      make: "Toyota",
      model: "RAV4",
      trim: "XLE",
      priceCents: 2599000,
      previousPriceCents: 2749000,
      mileage: 30100,
      bodyStyle: "SUV",
      exteriorColor: "Magnetic Gray",
      drivetrain: "AWD",
      transmission: "Automatic",
      fuelType: "Gasoline",
      status: "AVAILABLE" as VehicleStatus,
      photos: [
        "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=1200",
      ],
    },
    {
      stockNumber: "H1006",
      vin: "3VW2B7AJ5HM123456",
      year: 2017,
      make: "Volkswagen",
      model: "Jetta",
      trim: "SE",
      priceCents: 1299000,
      mileage: 78400,
      bodyStyle: "Sedan",
      exteriorColor: "Platinum Gray",
      drivetrain: "FWD",
      transmission: "Automatic",
      fuelType: "Gasoline",
      status: "SOLD" as VehicleStatus,
      soldAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
      photos: [
        "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=1200",
      ],
    },
  ];

  for (const v of vehicles) {
    const { photos, ...rest } = v;
    const vehicle = await prisma.vehicle.create({
      data: {
        orgId: org.id,
        sourceId: source.id,
        ...rest,
        description: `${rest.year} ${rest.make} ${rest.model} ${rest.trim ?? ""} — inspected, clean title, ready for delivery.`,
        contentHash: contentHash([
          rest.stockNumber,
          String(rest.priceCents),
          rest.status,
          String(rest.mileage ?? ""),
        ]),
        media: {
          create: photos.map((url, index) => ({
            url,
            sortOrder: index,
            kind: "PHOTO",
          })),
        },
      },
    });

    if (vehicle.stockNumber === "H1001") {
      const listing = await prisma.listing.create({
        data: {
          orgId: org.id,
          vehicleId: vehicle.id,
          userId: sales1.id,
          status: "PUBLISHED",
          title: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`,
          description: vehicle.description ?? "",
          priceCents: vehicle.priceCents,
          postedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
          externalUrl: "https://www.facebook.com/marketplace/item/demo-h1001",
        },
      });
      await prisma.listingEvent.create({
        data: {
          listingId: listing.id,
          actorId: sales1.id,
          type: "PUBLISHED",
          payload: { via: "seed" },
        },
      });
    }

    if (vehicle.stockNumber === "H1006") {
      const listing = await prisma.listing.create({
        data: {
          orgId: org.id,
          vehicleId: vehicle.id,
          userId: sales2.id,
          status: "NEEDS_REMOVAL",
          title: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`,
          description: vehicle.description ?? "",
          priceCents: vehicle.priceCents,
          postedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
        },
      });
      await prisma.listingEvent.create({
        data: {
          listingId: listing.id,
          actorId: null,
          type: "SOLD_DETECTED",
          payload: { via: "seed" },
        },
      });
      await prisma.notification.create({
        data: {
          orgId: org.id,
          userId: sales2.id,
          type: "VEHICLE_SOLD",
          title: "Remove sold listing",
          body: `${vehicle.year} ${vehicle.make} ${vehicle.model} marked sold — remove from Marketplace.`,
          meta: { vehicleId: vehicle.id, listingId: listing.id },
        },
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      orgId: org.id,
      actorId: owner.id,
      action: "ORG_SEEDED",
      entityType: "Organization",
      entityId: org.id,
      meta: { demo: true },
    },
  });

  await prisma.jobRun.create({
    data: {
      orgId: org.id,
      type: "inventory.sync",
      status: "SUCCEEDED",
      startedAt: new Date(Date.now() - 60_000),
      finishedAt: new Date(),
      stats: { imported: 6, updated: 0, sold: 1 },
    },
  });

  console.log("Seed complete.");
  console.log("Demo logins (password: DemoPass123!):");
  console.log("  owner@demo.okauto.local");
  console.log("  manager@demo.okauto.local");
  console.log("  alex@demo.okauto.local");
  console.log("  sam@demo.okauto.local");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
