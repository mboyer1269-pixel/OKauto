/**
 * Seed / demo data: one demo dealership with owner, manager, and two
 * salespeople, a feed source, 12 vehicles with photos, listings in various
 * states, notifications, and audit history.
 *
 * Logins (all password "demo-password-123"):
 *   owner@sunrisemotors.test / manager@sunrisemotors.test /
 *   alex@sunrisemotors.test  / bri@sunrisemotors.test
 * Platform admin: admin@lotpilot.test
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const PASSWORD = "demo-password-123";

const VEHICLES = [
  { vin: "1HGCM82633A004352", stockNumber: "SM-1001", year: 2019, make: "Honda", model: "Accord", trim: "EX-L", bodyStyle: "Sedan", mileage: 41230, priceCents: 2149900, exteriorColor: "Modern Steel", interiorColor: "Black", transmission: "CVT", fuelType: "Gasoline", drivetrain: "FWD", engine: "1.5L I4 Turbo" },
  { vin: "5YJ3E1EAXKF317231", stockNumber: "SM-1002", year: 2019, make: "Tesla", model: "Model 3", trim: "Standard Range Plus", bodyStyle: "Sedan", mileage: 38900, priceCents: 2699900, exteriorColor: "Pearl White", interiorColor: "Black", transmission: "Automatic", fuelType: "Electric", drivetrain: "RWD", engine: "Electric Motor" },
  { vin: "1FTFW1ET9DFC10312", stockNumber: "SM-1003", year: 2013, make: "Ford", model: "F-150", trim: "Lariat", bodyStyle: "Crew Cab Pickup", mileage: 98750, priceCents: 1899500, exteriorColor: "Race Red", interiorColor: "Tan", transmission: "6-Speed Automatic", fuelType: "Gasoline", drivetrain: "4WD", engine: "3.5L V6 EcoBoost" },
  { stockNumber: "SM-1004", year: 2021, make: "Toyota", model: "RAV4", trim: "XLE", bodyStyle: "SUV", mileage: 32500, priceCents: 2749900, exteriorColor: "Silver Sky", interiorColor: "Gray", transmission: "8-Speed Automatic", fuelType: "Gasoline", drivetrain: "AWD", engine: "2.5L I4" },
  { stockNumber: "SM-1005", year: 2020, make: "Chevrolet", model: "Equinox", trim: "LT", bodyStyle: "SUV", mileage: 45100, priceCents: 1999500, exteriorColor: "Mosaic Black", interiorColor: "Jet Black", transmission: "6-Speed Automatic", fuelType: "Gasoline", drivetrain: "FWD", engine: "1.5L I4 Turbo" },
  { stockNumber: "SM-1006", year: 2018, make: "Jeep", model: "Wrangler", trim: "Unlimited Sahara", bodyStyle: "SUV", mileage: 61200, priceCents: 3099900, exteriorColor: "Granite Crystal", interiorColor: "Black", transmission: "8-Speed Automatic", fuelType: "Gasoline", drivetrain: "4WD", engine: "3.6L V6" },
  { stockNumber: "SM-1007", year: 2022, make: "Hyundai", model: "Tucson", trim: "SEL", bodyStyle: "SUV", mileage: 18900, priceCents: 2589900, exteriorColor: "Amazon Gray", interiorColor: "Black", transmission: "8-Speed Automatic", fuelType: "Gasoline", drivetrain: "AWD", engine: "2.5L I4", condition: "CERTIFIED_PRE_OWNED" as const },
  { stockNumber: "SM-1008", year: 2017, make: "BMW", model: "X5", trim: "xDrive35i", bodyStyle: "SUV", mileage: 72400, priceCents: 2849900, exteriorColor: "Alpine White", interiorColor: "Mocha", transmission: "8-Speed Automatic", fuelType: "Gasoline", drivetrain: "AWD", engine: "3.0L I6 Turbo" },
  { stockNumber: "SM-1009", year: 2023, make: "Kia", model: "Telluride", trim: "SX", bodyStyle: "SUV", mileage: 12100, priceCents: 4289900, exteriorColor: "Dark Moss", interiorColor: "Butterscotch", transmission: "8-Speed Automatic", fuelType: "Gasoline", drivetrain: "AWD", engine: "3.8L V6", condition: "CERTIFIED_PRE_OWNED" as const },
  { stockNumber: "SM-1010", year: 2016, make: "Subaru", model: "Outback", trim: "2.5i Premium", bodyStyle: "Wagon", mileage: 89300, priceCents: 1549500, exteriorColor: "Twilight Blue", interiorColor: "Warm Ivory", transmission: "CVT", fuelType: "Gasoline", drivetrain: "AWD", engine: "2.5L H4" },
  { stockNumber: "SM-1011", year: 2020, make: "Ram", model: "1500", trim: "Big Horn", bodyStyle: "Crew Cab Pickup", mileage: 55600, priceCents: 3199900, exteriorColor: "Patriot Blue", interiorColor: "Black", transmission: "8-Speed Automatic", fuelType: "Gasoline", drivetrain: "4WD", engine: "5.7L V8 HEMI" },
  { stockNumber: "SM-1012", year: 2015, make: "Mazda", model: "CX-5", trim: "Touring", bodyStyle: "SUV", mileage: 104800, priceCents: 1199500, exteriorColor: "Soul Red", interiorColor: "Black", transmission: "6-Speed Automatic", fuelType: "Gasoline", drivetrain: "FWD", engine: "2.5L I4", status: "SOLD" as const },
];

function photoUrl(seed: string, n: number): string {
  return `https://picsum.photos/seed/${seed}-${n}/1200/800`;
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@lotpilot.test" },
    update: {},
    create: { email: "admin@lotpilot.test", name: "Platform Admin", passwordHash, platformRole: "ADMIN" },
  });

  const [owner, manager, alex, bri] = await Promise.all(
    [
      { email: "owner@sunrisemotors.test", name: "Olivia Owens", phone: "(555) 010-2000" },
      { email: "manager@sunrisemotors.test", name: "Marcus Reid", phone: "(555) 010-2001" },
      { email: "alex@sunrisemotors.test", name: "Alex Chen", phone: "(555) 010-2002" },
      { email: "bri@sunrisemotors.test", name: "Bri Santos", phone: "(555) 010-2003" },
    ].map((u) =>
      prisma.user.upsert({ where: { email: u.email }, update: {}, create: { ...u, passwordHash } }),
    ),
  );

  const org = await prisma.organization.upsert({
    where: { slug: "sunrise-motors" },
    update: {},
    create: {
      name: "Sunrise Motors",
      slug: "sunrise-motors",
      website: "https://sunrisemotors.example.com",
      phone: "(555) 010-2000",
      address: "4801 Commerce Dr",
      city: "Columbus",
      state: "OH",
      zip: "43215",
      settings: {
        disclaimers: ["Price excludes tax, title, license, and $299 documentation fee."],
        soldDetectionThreshold: 2,
        defaultTone: "professional",
        defaultLocation: "Columbus, OH",
      },
    },
  });

  await Promise.all(
    [
      { userId: owner!.id, role: "OWNER" as const },
      { userId: manager!.id, role: "MANAGER" as const },
      { userId: alex!.id, role: "SALESPERSON" as const },
      { userId: bri!.id, role: "SALESPERSON" as const },
    ].map((m) =>
      prisma.membership.upsert({
        where: { userId_organizationId: { userId: m.userId, organizationId: org.id } },
        update: { role: m.role },
        create: { ...m, organizationId: org.id },
      }),
    ),
  );

  const source = await prisma.inventorySource.upsert({
    where: { id: "seed-source" },
    update: {},
    create: {
      id: "seed-source",
      organizationId: org.id,
      name: "DMS Feed (demo)",
      type: "FEED_CSV",
      url: "https://feeds.example.com/sunrise-motors/inventory.csv",
      scheduleMinutes: 60,
      fieldMapping: {},
      lastSyncAt: new Date(Date.now() - 30 * 60 * 1000),
      nextSyncAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  // Demo API token with a stable value so the extension can be exercised immediately.
  const demoTokenValue = "lp_demo_extension_token_do_not_use_in_prod";
  await prisma.apiToken.upsert({
    where: { tokenHash: createHash("sha256").update(demoTokenValue).digest("hex") },
    update: {},
    create: {
      userId: alex!.id,
      organizationId: org.id,
      name: "Demo extension token (Alex)",
      tokenHash: createHash("sha256").update(demoTokenValue).digest("hex"),
    },
  });

  for (const [i, v] of VEHICLES.entries()) {
    const { status, condition, ...rest } = v as typeof v & { status?: "SOLD"; condition?: "CERTIFIED_PRE_OWNED" };
    const vehicle = await prisma.vehicle.upsert({
      where: { organizationId_stockNumber: { organizationId: org.id, stockNumber: v.stockNumber } },
      update: {},
      create: {
        ...rest,
        organizationId: org.id,
        sourceId: source.id,
        condition: condition ?? "USED",
        status: status ?? "AVAILABLE",
        soldAt: status === "SOLD" ? new Date(Date.now() - 2 * 24 * 3600 * 1000) : null,
        firstSeenAt: new Date(Date.now() - (20 - i) * 24 * 3600 * 1000),
      },
    });
    const existingPhotos = await prisma.vehiclePhoto.count({ where: { vehicleId: vehicle.id } });
    if (existingPhotos === 0) {
      await prisma.vehiclePhoto.createMany({
        data: Array.from({ length: 4 }, (_, n) => ({
          vehicleId: vehicle.id,
          url: photoUrl(v.stockNumber, n + 1),
          position: n,
        })),
      });
    }
  }

  const accord = await prisma.vehicle.findFirstOrThrow({ where: { organizationId: org.id, stockNumber: "SM-1001" } });
  const tesla = await prisma.vehicle.findFirstOrThrow({ where: { organizationId: org.id, stockNumber: "SM-1002" } });
  const soldCx5 = await prisma.vehicle.findFirstOrThrow({ where: { organizationId: org.id, stockNumber: "SM-1012" } });

  const existingListings = await prisma.listing.count({ where: { organizationId: org.id } });
  if (existingListings === 0) {
    const posted = await prisma.listing.create({
      data: {
        organizationId: org.id,
        vehicleId: accord.id,
        userId: alex!.id,
        status: "POSTED",
        externalUrl: "https://www.facebook.com/marketplace/item/000000000000001/",
        titleSnapshot: "2019 Honda Accord EX-L",
        priceSnapshotCents: accord.priceCents,
        preparedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
        postedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000 + 15 * 60 * 1000),
      },
    });
    await prisma.listingEvent.createMany({
      data: [
        { listingId: posted.id, actorId: alex!.id, type: "CREATED", data: {} },
        { listingId: posted.id, actorId: alex!.id, type: "PREPARED", data: { via: "extension" } },
        { listingId: posted.id, actorId: alex!.id, type: "POSTED", data: { url: posted.externalUrl } },
      ],
    });

    await prisma.listing.create({
      data: {
        organizationId: org.id,
        vehicleId: tesla.id,
        userId: bri!.id,
        status: "PREPARED",
        titleSnapshot: "2019 Tesla Model 3 Standard Range Plus",
        priceSnapshotCents: tesla.priceCents,
        preparedAt: new Date(Date.now() - 3600 * 1000),
      },
    });

    // A listing whose vehicle was sold — drives the "delist" alert demo.
    const stale = await prisma.listing.create({
      data: {
        organizationId: org.id,
        vehicleId: soldCx5.id,
        userId: bri!.id,
        status: "DELIST_REQUESTED",
        externalUrl: "https://www.facebook.com/marketplace/item/000000000000002/",
        titleSnapshot: "2015 Mazda CX-5 Touring",
        priceSnapshotCents: soldCx5.priceCents,
        postedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000),
      },
    });
    await prisma.listingEvent.createMany({
      data: [
        { listingId: stale.id, actorId: bri!.id, type: "POSTED", data: { url: stale.externalUrl } },
        { listingId: stale.id, type: "DELIST_REQUESTED", data: { reason: "vehicle marked sold" } },
      ],
    });

    await prisma.notification.create({
      data: {
        organizationId: org.id,
        userId: bri!.id,
        type: "VEHICLE_SOLD",
        title: "Vehicle sold — delist your Marketplace post",
        body: "2015 Mazda CX-5 Touring (SM-1012) was marked sold. Please remove your Facebook Marketplace listing.",
        data: { vehicleId: soldCx5.id, listingId: stale.id },
      },
    });

    await prisma.priceChange.create({
      data: { vehicleId: tesla.id, oldPriceCents: 2749900, newPriceCents: 2699900 },
    });

    await prisma.syncRun.create({
      data: {
        sourceId: source.id,
        status: "SUCCESS",
        trigger: "schedule",
        stats: { total: 12, created: 0, updated: 12, priceChanges: 1, markedMissing: 1, markedSold: 1 },
        startedAt: new Date(Date.now() - 31 * 60 * 1000),
        finishedAt: new Date(Date.now() - 30 * 60 * 1000),
      },
    });

    await prisma.auditLog.createMany({
      data: [
        { organizationId: org.id, userId: owner!.id, action: "org.create", entityType: "organization", entityId: org.id },
        { organizationId: org.id, userId: manager!.id, action: "source.create", entityType: "source", entityId: source.id },
        { organizationId: org.id, userId: alex!.id, action: "listing.posted", entityType: "listing", entityId: posted.id },
      ],
    });
  }

  // Pending invitation demo (token printed for manual testing).
  const inviteToken = randomBytes(24).toString("hex");
  await prisma.invitation.create({
    data: {
      organizationId: org.id,
      email: "newhire@sunrisemotors.test",
      role: "SALESPERSON",
      tokenHash: createHash("sha256").update(inviteToken).digest("hex"),
      invitedById: manager!.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });

  console.log("Seed complete.");
  console.log(`  Dealership: ${org.name} (${org.slug})`);
  console.log(`  Users (password "${PASSWORD}"):`);
  console.log("    owner@sunrisemotors.test (OWNER)");
  console.log("    manager@sunrisemotors.test (MANAGER)");
  console.log("    alex@sunrisemotors.test / bri@sunrisemotors.test (SALESPERSON)");
  console.log(`    admin@lotpilot.test (platform ADMIN, id ${admin.id})`);
  console.log(`  Demo extension API token: ${demoTokenValue}`);
  console.log(`  Demo invite token (newhire@sunrisemotors.test): ${inviteToken}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
