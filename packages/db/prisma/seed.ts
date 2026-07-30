import { buildMarketplaceDescription, demoVehicles } from "@okauto/shared";
import { hashPassword, hashToken, prisma } from "../src/index.js";

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: "okauto-demo" },
    update: { name: "OKauto Demo Motors" },
    create: {
      name: "OKauto Demo Motors",
      slug: "okauto-demo"
    }
  });

  const dealership = await prisma.dealership.upsert({
    where: { id: "demo-dealership" },
    update: {
      name: "OKauto Demo Motors",
      websiteUrl: "https://example-dealer.test",
      city: "Findlay",
      state: "OH"
    },
    create: {
      id: "demo-dealership",
      organizationId: organization.id,
      name: "OKauto Demo Motors",
      websiteUrl: "https://example-dealer.test",
      city: "Findlay",
      state: "OH"
    }
  });

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: "owner@okauto.test" },
      update: { name: "Riley Carter", passwordHash: hashPassword("okauto-demo-pass") },
      create: {
        organizationId: organization.id,
        email: "owner@okauto.test",
        name: "Riley Carter",
        passwordHash: hashPassword("okauto-demo-pass")
      }
    }),
    prisma.user.upsert({
      where: { email: "avery@okauto.test" },
      update: { name: "Avery Johnson", passwordHash: hashPassword("okauto-demo-pass") },
      create: {
        organizationId: organization.id,
        email: "avery@okauto.test",
        name: "Avery Johnson",
        passwordHash: hashPassword("okauto-demo-pass")
      }
    }),
    prisma.user.upsert({
      where: { email: "morgan@okauto.test" },
      update: { name: "Morgan Lee", passwordHash: hashPassword("okauto-demo-pass") },
      create: {
        organizationId: organization.id,
        email: "morgan@okauto.test",
        name: "Morgan Lee",
        passwordHash: hashPassword("okauto-demo-pass")
      }
    })
  ]);

  await Promise.all(
    users.map((user, index) =>
      prisma.membership.upsert({
        where: {
          organizationId_dealershipId_userId_role: {
            organizationId: organization.id,
            dealershipId: index === 0 ? null : dealership.id,
            userId: user.id,
            role: index === 0 ? "OWNER" : "SALESPERSON"
          }
        },
        update: {},
        create: {
          organizationId: organization.id,
          dealershipId: index === 0 ? null : dealership.id,
          userId: user.id,
          role: index === 0 ? "OWNER" : "SALESPERSON"
        }
      })
    )
  );

  const websiteSource = await prisma.inventorySource.upsert({
    where: { id: "demo-website-source" },
    update: { enabled: true },
    create: {
      id: "demo-website-source",
      organizationId: organization.id,
      dealershipId: dealership.id,
      type: "WEBSITE",
      name: "Dealer website"
    }
  });

  await prisma.sourceSyncRun.create({
    data: {
      sourceId: websiteSource.id,
      status: "SUCCESS",
      finishedAt: new Date(),
      recordsSeen: demoVehicles.length,
      recordsUpserted: demoVehicles.length,
      message: "Seeded demo inventory."
    }
  });

  for (const demoVehicle of demoVehicles) {
    const vehicle = await prisma.vehicle.upsert({
      where: { id: demoVehicle.id },
      update: {
        price: demoVehicle.price,
        status: demoVehicle.status,
        mileage: demoVehicle.mileage
      },
      create: {
        id: demoVehicle.id,
        organizationId: organization.id,
        dealershipId: dealership.id,
        sourceId: websiteSource.id,
        vin: demoVehicle.vin,
        stockNumber: demoVehicle.stockNumber,
        year: demoVehicle.year,
        make: demoVehicle.make,
        model: demoVehicle.model,
        trim: demoVehicle.trim,
        bodyStyle: demoVehicle.bodyStyle,
        drivetrain: demoVehicle.drivetrain,
        transmission: demoVehicle.transmission,
        fuelType: demoVehicle.fuelType,
        exteriorColor: demoVehicle.exteriorColor,
        interiorColor: demoVehicle.interiorColor,
        mileage: demoVehicle.mileage,
        price: demoVehicle.price,
        status: demoVehicle.status,
        location: demoVehicle.location,
        features: demoVehicle.features,
        notes: demoVehicle.notes,
        identityKey: demoVehicle.vin ? `vin:${demoVehicle.vin}` : `stock:${demoVehicle.stockNumber}`,
        sourceUrl: `https://example-dealer.test/inventory/${demoVehicle.stockNumber ?? demoVehicle.id}`
      }
    });

    await prisma.vehicleMedia.createMany({
      data: Array.from({ length: Math.min(demoVehicle.photoCount, 6) }).map((_, index) => ({
        vehicleId: vehicle.id,
        url: `https://images.example-dealer.test/${vehicle.id}/${index + 1}.jpg`,
        alt: `${demoVehicle.year} ${demoVehicle.make} ${demoVehicle.model} photo ${index + 1}`,
        sortOrder: index,
        source: "WEBSITE" as const
      })),
      skipDuplicates: true
    });

    const assignedTo = users.find((user) => user.name === demoVehicle.salesperson);
    const listing = await prisma.listing.upsert({
      where: { id: `lst-${demoVehicle.id}` },
      update: {
        status: demoVehicle.listingStatus ?? "DRAFT",
        price: demoVehicle.price
      },
      create: {
        id: `lst-${demoVehicle.id}`,
        organizationId: organization.id,
        vehicleId: vehicle.id,
        assignedToUserId: assignedTo?.id,
        title: `${demoVehicle.year} ${demoVehicle.make} ${demoVehicle.model} ${demoVehicle.trim ?? ""}`.trim(),
        description: buildMarketplaceDescription(demoVehicle, {
          dealershipName: dealership.name,
          city: `${dealership.city}, ${dealership.state}`
        }),
        price: demoVehicle.price,
        location: demoVehicle.location,
        marketplaceUrl:
          demoVehicle.listingStatus === "POSTED"
            ? "https://www.facebook.com/marketplace/item/demo"
            : undefined,
        status: demoVehicle.listingStatus ?? "DRAFT",
        postedAt: demoVehicle.listingStatus === "POSTED" ? new Date("2026-07-29T19:00:00.000Z") : undefined,
        snapshots: {
          create: {
            status: demoVehicle.listingStatus ?? "DRAFT",
            price: demoVehicle.price,
            notes: "Seed snapshot."
          }
        }
      }
    });

    await prisma.activityEvent.create({
      data: {
        organizationId: organization.id,
        actorUserId: assignedTo?.id,
        vehicleId: vehicle.id,
        listingId: listing.id,
        action: demoVehicle.listingStatus === "POSTED" ? "posted_listing" : "prepared_listing",
        metadata: { seeded: true }
      }
    });

    if (demoVehicle.listingStatus === "SOLD_ALERT") {
      await prisma.notification.create({
        data: {
          organizationId: organization.id,
          userId: assignedTo?.id,
          vehicleId: vehicle.id,
          listingId: listing.id,
          type: "SOLD_ALERT",
          title: `Remove sold ${demoVehicle.make} ${demoVehicle.model} listing`,
          message: `${demoVehicle.stockNumber ?? vehicle.id} is sold in inventory. Confirm marketplace removal.`,
          severity: "critical"
        }
      });
    }
  }

  const token = process.env.OKAUTO_EXTENSION_TOKEN ?? "demo-extension-token-rotate-before-production";
  await prisma.extensionCredential.upsert({
    where: { tokenHash: hashToken(token) },
    update: { revokedAt: null },
    create: {
      organizationId: organization.id,
      name: "Demo extension token",
      tokenHash: hashToken(token),
      allowedOrigins: ["https://example-dealer.test", "https://www.facebook.com"]
    }
  });

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      actorUserId: users[0]?.id,
      action: "seed_demo_data",
      resourceType: "organization",
      resourceId: organization.id,
      metadata: { vehicleCount: demoVehicles.length }
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
