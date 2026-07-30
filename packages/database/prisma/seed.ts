/**
 * Seed/demo data: one demo dealership with owner/manager/salespeople, inventory,
 * listings across the lifecycle, notifications, and a default description template.
 * Idempotent: wipes the demo org + demo users first, then recreates.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "demo-password-123";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@okauto.dev";

const img = (seed: string) => `https://picsum.photos/seed/${seed}/900/600`;

async function main() {
  console.info("Seeding OKauto demo data…");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Clean previous demo data (cascades remove children).
  await prisma.organization.deleteMany({ where: { slug: "demo-motors" } });
  await prisma.user.deleteMany({
    where: { email: { in: [ADMIN_EMAIL, "owner@demo.dev", "manager@demo.dev", "sam@demo.dev", "riley@demo.dev"] } },
  });

  await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash,
      name: "Platform Admin",
      isPlatformAdmin: true,
    },
  });

  const org = await prisma.organization.create({
    data: {
      name: "Demo Motors",
      slug: "demo-motors",
      vertical: "AUTOMOTIVE",
      timezone: "America/Chicago",
      settings: {
        dealerContact: "(555) 010-0100",
        descriptionFooter:
          "Demo Motors is a licensed dealer. Prices exclude tax, title, license and dealer fees. Call to confirm availability.",
        soldDetectionEnabled: true,
        priceChangeAlertsEnabled: true,
      },
      onboarding: { inventoryAdded: true, descriptionGenerated: true, extensionInstalled: false, teamInvited: true },
    },
  });

  const [owner, manager, sam, riley] = await Promise.all([
    prisma.user.create({ data: { email: "owner@demo.dev", passwordHash, name: "Dana Owner" } }),
    prisma.user.create({ data: { email: "manager@demo.dev", passwordHash, name: "Morgan Manager" } }),
    prisma.user.create({ data: { email: "sam@demo.dev", passwordHash, name: "Sam Seller" } }),
    prisma.user.create({ data: { email: "riley@demo.dev", passwordHash, name: "Riley Deals" } }),
  ]);

  await prisma.membership.createMany({
    data: [
      { userId: owner.id, orgId: org.id, role: "ORG_OWNER" },
      { userId: manager.id, orgId: org.id, role: "ORG_MANAGER" },
      { userId: sam.id, orgId: org.id, role: "SALESPERSON" },
      { userId: riley.id, orgId: org.id, role: "SALESPERSON" },
    ],
  });

  await prisma.descriptionTemplate.create({
    data: {
      orgId: org.id,
      name: "Default — professional",
      isDefault: true,
      body: `{{year}} {{make}} {{model}}{{#trim}} {{trim}}{{/trim}}

{{summaryLine}}

Key details:
{{specLines}}

{{dealerLine}}

{{footer}}`,
    },
  });

  const manualSource = await prisma.importSource.create({
    data: { orgId: org.id, type: "MANUAL", name: "Manual entry" },
  });

  const vehiclesData = [
    { vin: "1HGCM82633A004352", stockNumber: "P1001", year: 2003, make: "Honda", model: "Accord", trim: "EX", bodyStyle: "SEDAN" as const, mileage: 98400, priceCents: 599500, exteriorColor: "Silver" },
    { vin: "1FTFW1ET4EFA12345", stockNumber: "P1002", year: 2014, make: "Ford", model: "F-150", trim: "XLT", bodyStyle: "TRUCK" as const, mileage: 88210, priceCents: 2199500, exteriorColor: "Blue" },
    { vin: "5YJ3E1EA7KF317000", stockNumber: "P1003", year: 2019, make: "Tesla", model: "Model 3", trim: "Standard Range Plus", bodyStyle: "SEDAN" as const, fuelType: "ELECTRIC" as const, mileage: 41200, priceCents: 2499500, exteriorColor: "White" },
    { vin: "2T1BURHE7JC104321", stockNumber: "P1004", year: 2018, make: "Toyota", model: "Corolla", trim: "LE", bodyStyle: "SEDAN" as const, mileage: 62300, priceCents: 1399500, exteriorColor: "Gray" },
    { vin: "KM8J3CA46JU712345", stockNumber: "P1005", year: 2018, make: "Hyundai", model: "Tucson", trim: "SEL", bodyStyle: "SUV" as const, mileage: 55100, priceCents: 1549500, exteriorColor: "Red" },
    { vin: "1C4RJFBG5EC301122", stockNumber: "P1006", year: 2014, make: "Jeep", model: "Grand Cherokee", trim: "Limited", bodyStyle: "SUV" as const, mileage: 91800, priceCents: 1699500, exteriorColor: "Black" },
    { vin: "3N1AB7AP7KY123987", stockNumber: "P1007", year: 2019, make: "Nissan", model: "Sentra", trim: "SV", bodyStyle: "SEDAN" as const, mileage: 48600, priceCents: 1249500, exteriorColor: "Blue" },
    { vin: "1G1ZD5ST4JF123456", stockNumber: "P1008", year: 2018, make: "Chevrolet", model: "Malibu", trim: "LT", bodyStyle: "SEDAN" as const, mileage: 59900, priceCents: 1349500, exteriorColor: "White" },
    { vin: "WBA8E9G51GNU12345", stockNumber: "P1009", year: 2016, make: "BMW", model: "320i", trim: "xDrive", bodyStyle: "SEDAN" as const, mileage: 72300, priceCents: 1599500, exteriorColor: "Black" },
    { vin: "JTMRFREV7JD212345", stockNumber: "P1010", year: 2018, make: "Toyota", model: "RAV4", trim: "XLE", bodyStyle: "SUV" as const, mileage: 51200, priceCents: 2099500, exteriorColor: "Silver" },
  ];

  const vehicles: { id: string; vin: string | null; priceCents: number; make: string; model: string; year: number | null }[] = [];
  for (const [i, v] of vehiclesData.entries()) {
    const vehicle = await prisma.vehicle.create({
      data: {
        orgId: org.id,
        sourceId: manualSource.id,
        createdById: manager.id,
        transmission: "AUTOMATIC",
        drivetrain: "FWD",
        fuelType: "GASOLINE",
        condition: "USED",
        status: "ACTIVE",
        ...v,
        photos: { create: [0, 1, 2, 3].map((p) => ({ url: img(`${v.stockNumber}-${p}`), position: p })) },
        priceHistory: { create: [{ priceCents: v.priceCents, source: "SEED" }] },
        description: `${v.year} ${v.make} ${v.model} ${v.trim}\n\nWell-maintained used ${v.year} ${v.make} ${v.model} with ${v.mileage.toLocaleString("en-US")} miles. Contact us today to schedule a test drive.`,
      },
    });
    vehicles.push(vehicle);
    void i;
  }

  // One price-changed vehicle with history.
  const priceChanged = await prisma.vehicle.create({
    data: {
      orgId: org.id,
      sourceId: manualSource.id,
      vin: "KNDJP3A55G7123456",
      stockNumber: "P1011",
      year: 2016,
      make: "Kia",
      model: "Soul",
      trim: "+",
      bodyStyle: "HATCHBACK",
      mileage: 78900,
      priceCents: 999500,
      status: "PRICE_CHANGED",
      transmission: "AUTOMATIC",
      photos: { create: [0, 1].map((p) => ({ url: img(`P1011-${p}`), position: p })) },
      priceHistory: {
        create: [
          { priceCents: 1099500, source: "SEED", createdAt: new Date(Date.now() - 10 * 86400_000) },
          { priceCents: 999500, source: "SYNC", createdAt: new Date(Date.now() - 2 * 86400_000) },
        ],
      },
    },
  });

  // Listings across lifecycle states.
  const liveListing = await prisma.listing.create({
    data: {
      orgId: org.id,
      vehicleId: vehicles[1]!.id,
      channel: "MARKETPLACE",
      status: "LIVE",
      title: "2014 Ford F-150 XLT",
      priceCents: vehicles[1]!.priceCents,
      assigneeId: sam.id,
      createdById: sam.id,
      externalUrl: "https://www.facebook.com/marketplace/item/1234567890123456",
      postedAt: new Date(Date.now() - 3 * 86400_000),
      events: {
        create: [
          { actorType: "USER", actorUserId: sam.id, toStatus: "DRAFT", createdAt: new Date(Date.now() - 4 * 86400_000) },
          { actorType: "USER", actorUserId: sam.id, fromStatus: "DRAFT", toStatus: "QUEUED", createdAt: new Date(Date.now() - 4 * 86400_000 + 60_000) },
          { actorType: "EXTENSION", actorUserId: sam.id, fromStatus: "QUEUED", toStatus: "IN_PROGRESS", createdAt: new Date(Date.now() - 3 * 86400_000) },
          { actorType: "EXTENSION", actorUserId: sam.id, fromStatus: "IN_PROGRESS", toStatus: "LIVE", note: "Published by user via assisted flow", createdAt: new Date(Date.now() - 3 * 86400_000 + 120_000) },
        ],
      },
    },
  });

  await prisma.listing.create({
    data: {
      orgId: org.id,
      vehicleId: vehicles[2]!.id,
      status: "QUEUED",
      title: "2019 Tesla Model 3 Standard Range Plus",
      priceCents: vehicles[2]!.priceCents,
      assigneeId: sam.id,
      createdById: manager.id,
      events: {
        create: [
          { actorType: "USER", actorUserId: manager.id, toStatus: "DRAFT" },
          { actorType: "USER", actorUserId: manager.id, fromStatus: "DRAFT", toStatus: "QUEUED" },
        ],
      },
    },
  });

  await prisma.listing.create({
    data: {
      orgId: org.id,
      vehicleId: vehicles[4]!.id,
      status: "ATTENTION",
      title: "2018 Hyundai Tucson SEL",
      priceCents: vehicles[4]!.priceCents,
      assigneeId: riley.id,
      createdById: riley.id,
      failureReason: "Marketplace form layout changed; mileage field not found. Update adapter config and re-queue.",
      events: {
        create: [
          { actorType: "USER", actorUserId: riley.id, toStatus: "DRAFT" },
          { actorType: "USER", actorUserId: riley.id, fromStatus: "DRAFT", toStatus: "QUEUED" },
          { actorType: "EXTENSION", actorUserId: riley.id, fromStatus: "QUEUED", toStatus: "IN_PROGRESS" },
          {
            actorType: "EXTENSION",
            actorUserId: riley.id,
            fromStatus: "IN_PROGRESS",
            toStatus: "ATTENTION",
            note: "Field fill failed: mileage",
          },
        ],
      },
    },
  });

  // A sold vehicle whose listing was removed.
  const soldVehicle = await prisma.vehicle.create({
    data: {
      orgId: org.id,
      vin: "1FA6P8TH8J5102345",
      stockNumber: "P1012",
      year: 2018,
      make: "Ford",
      model: "Mustang",
      trim: "EcoBoost",
      bodyStyle: "COUPE",
      mileage: 45000,
      priceCents: 2299500,
      status: "SOLD",
      soldAt: new Date(Date.now() - 86400_000),
      photos: { create: [0, 1].map((p) => ({ url: img(`P1012-${p}`), position: p })) },
      priceHistory: { create: [{ priceCents: 2299500, source: "SEED" }] },
    },
  });

  await prisma.listing.create({
    data: {
      orgId: org.id,
      vehicleId: soldVehicle.id,
      status: "REMOVED",
      title: "2018 Ford Mustang EcoBoost",
      priceCents: 2299500,
      assigneeId: riley.id,
      createdById: riley.id,
      externalUrl: "https://www.facebook.com/marketplace/item/9876543210987654",
      postedAt: new Date(Date.now() - 8 * 86400_000),
      removedAt: new Date(Date.now() - 86400_000),
      events: {
        create: [
          { actorType: "USER", actorUserId: riley.id, toStatus: "DRAFT", createdAt: new Date(Date.now() - 9 * 86400_000) },
          { actorType: "USER", actorUserId: riley.id, fromStatus: "DRAFT", toStatus: "QUEUED", createdAt: new Date(Date.now() - 9 * 86400_000 + 60_000) },
          { actorType: "EXTENSION", actorUserId: riley.id, fromStatus: "QUEUED", toStatus: "LIVE", createdAt: new Date(Date.now() - 8 * 86400_000) },
          { actorType: "SYSTEM", fromStatus: "LIVE", toStatus: "NEEDS_REMOVAL", note: "Vehicle missing from latest feed sync", createdAt: new Date(Date.now() - 86400_000 - 3600_000) },
          { actorType: "USER", actorUserId: riley.id, fromStatus: "NEEDS_REMOVAL", toStatus: "REMOVED", note: "Sold — confirmed and removed", createdAt: new Date(Date.now() - 86400_000) },
        ],
      },
    },
  });

  // Historical listing events for analytics (past 14 days, mixed reps).
  const eventSeed: { userId: string; daysAgo: number; toStatus: "LIVE" | "QUEUED" }[] = [
    { userId: sam.id, daysAgo: 1, toStatus: "LIVE" },
    { userId: sam.id, daysAgo: 2, toStatus: "LIVE" },
    { userId: sam.id, daysAgo: 5, toStatus: "QUEUED" },
    { userId: riley.id, daysAgo: 1, toStatus: "QUEUED" },
    { userId: riley.id, daysAgo: 3, toStatus: "LIVE" },
    { userId: riley.id, daysAgo: 6, toStatus: "LIVE" },
    { userId: riley.id, daysAgo: 12, toStatus: "LIVE" },
  ];
  for (const e of eventSeed) {
    await prisma.listingEvent.create({
      data: {
        listingId: liveListing.id,
        actorType: "USER",
        actorUserId: e.userId,
        fromStatus: "IN_PROGRESS",
        toStatus: e.toStatus,
        createdAt: new Date(Date.now() - e.daysAgo * 86400_000),
      },
    });
  }

  await prisma.notification.createMany({
    data: [
      {
        orgId: org.id,
        userId: riley.id,
        type: "PRICE_CHANGED",
        title: "Price change: 2016 Kia Soul +",
        body: "Feed price updated from $10,995 to $9,995.",
        data: { vehicleId: priceChanged.id, fromCents: 1099500, toCents: 999500 },
      },
      {
        orgId: org.id,
        userId: riley.id,
        type: "LISTING_ATTENTION",
        title: "Listing needs attention: 2018 Hyundai Tucson SEL",
        body: "Field fill failed during assisted listing. Review and re-queue.",
        data: { listingId: liveListing.id },
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      orgId: org.id,
      actorType: "SYSTEM",
      action: "SEED",
      entityType: "Organization",
      entityId: org.id,
      meta: { note: "Demo dataset created" },
    },
  });

  console.info("Seed complete.");
  console.info(`  Demo org: ${org.name} (${org.slug})`);
  console.info(`  Users: owner@demo.dev / manager@demo.dev / sam@demo.dev / riley@demo.dev — password: ${DEMO_PASSWORD}`);
  console.info(`  Platform admin: ${ADMIN_EMAIL} — password: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
