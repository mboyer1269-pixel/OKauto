/**
 * Seed script: creates a demo dealership with users across roles, a normalized
 * inventory, listings in various states, and sample notifications. Idempotent-ish:
 * it upserts users/org by unique keys and clears demo vehicles/listings first.
 */
import {
  buildVehicleTitle,
  computeDedupKeys,
  normalizeVehicle,
  type RawVehicleInput,
} from '@okauto/shared';
import { hashPassword } from '@okauto/shared/password';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_ORG_SLUG = 'okauto-demo-motors';

const demoUsers = [
  { email: 'owner@okauto.dev', name: 'Olivia Owner', role: 'OWNER' as const },
  { email: 'manager@okauto.dev', name: 'Marco Manager', role: 'MANAGER' as const },
  { email: 'sales1@okauto.dev', name: 'Sam Seller', role: 'SALESPERSON' as const },
  { email: 'sales2@okauto.dev', name: 'Nia Numbers', role: 'SALESPERSON' as const },
  { email: 'viewer@okauto.dev', name: 'Val Viewer', role: 'VIEWER' as const },
];

const demoVehicles: (RawVehicleInput & { photoUrls: string[] })[] = [
  {
    vin: '1HGCM82633A004352', stockNumber: 'A1001', category: 'car', year: 2019,
    make: 'Honda', model: 'Accord', trim: 'Sport', mileage: 52000, price: 21995,
    fuelType: 'gas', transmission: 'automatic', exteriorColor: 'black', interiorColor: 'black',
    features: 'Backup Camera, Apple CarPlay, Lane Keep Assist', condition: 'excellent',
    photoUrls: ['https://picsum.photos/seed/accord1/800/600', 'https://picsum.photos/seed/accord2/800/600'],
  },
  {
    vin: '1FTFW1ET5DFC10312', stockNumber: 'A1002', category: 'truck', year: 2020,
    make: 'Ford', model: 'F-150', trim: 'XLT', mileage: 41000, price: 32995,
    fuelType: 'gas', transmission: 'automatic', drivetrain: '4WD', exteriorColor: 'blue',
    features: 'Tow Package, Bluetooth, Bed Liner', condition: 'good',
    photoUrls: ['https://picsum.photos/seed/f150a/800/600'],
  },
  {
    vin: '5YJ3E1EA7HF000337', stockNumber: 'A1003', category: 'car', year: 2021,
    make: 'Tesla', model: 'Model 3', trim: 'Standard Range Plus', mileage: 28000, price: 33995,
    fuelType: 'electric', transmission: 'automatic', exteriorColor: 'white', interiorColor: 'white',
    features: 'Autopilot, Glass Roof, Heated Seats', condition: 'excellent',
    photoUrls: ['https://picsum.photos/seed/tesla3/800/600'],
  },
  {
    stockNumber: 'A1004', category: 'suv', year: 2018, make: 'Toyota', model: 'RAV4',
    trim: 'LE', mileage: 63000, price: 18995, fuelType: 'gas', transmission: 'automatic',
    features: 'AWD, Backup Camera', condition: 'good',
    photoUrls: ['https://picsum.photos/seed/rav4/800/600'],
  },
  {
    vin: '1G1ZD5ST8JF120001', stockNumber: 'A1005', category: 'car', year: 2018,
    make: 'Chevrolet', model: 'Malibu', trim: 'LT', mileage: 71000, price: 15995,
    fuelType: 'gas', transmission: 'automatic', exteriorColor: 'silver',
    features: 'Apple CarPlay, Remote Start', condition: 'fair',
    photoUrls: ['https://picsum.photos/seed/malibu/800/600'],
  },
];

async function main() {
  const password = await hashPassword('Password123!');

  const org = await prisma.organization.upsert({
    where: { slug: DEMO_ORG_SLUG },
    update: {},
    create: { name: 'OKauto Demo Motors', slug: DEMO_ORG_SLUG, category: 'AUTOMOTIVE' },
  });

  const users: Record<string, string> = {};
  for (const u of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name },
      create: { email: u.email, name: u.name, passwordHash: password },
    });
    users[u.role] = user.id;
    await prisma.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
      update: { role: u.role },
      create: { userId: user.id, organizationId: org.id, role: u.role },
    });
  }

  // Reset demo inventory/listings for a clean run.
  await prisma.vehicle.deleteMany({ where: { organizationId: org.id } });

  const createdVehicles: { id: string; title: string; priceCents: number | null }[] = [];
  for (const raw of demoVehicles) {
    const n = normalizeVehicle(raw);
    const keys = computeDedupKeys(n);
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        vin: n.vin,
        stockNumber: n.stockNumber,
        category: n.category,
        year: n.year,
        make: n.make,
        model: n.model,
        trim: n.trim,
        mileage: n.mileage,
        priceCents: n.priceCents,
        fuelType: n.fuelType,
        transmission: n.transmission,
        drivetrain: n.drivetrain,
        exteriorColor: n.exteriorColor,
        interiorColor: n.interiorColor,
        condition: n.condition,
        features: n.features,
        title: buildVehicleTitle(n),
        dedupSignature: keys.fuzzySignature,
        status: 'AVAILABLE',
        photos: {
          create: raw.photoUrls.map((url, i) => ({ url, position: i })),
        },
      },
    });
    createdVehicles.push({ id: vehicle.id, title: vehicle.title, priceCents: vehicle.priceCents });
  }

  // Create a few listings in various states.
  const salesIds = [users.SALESPERSON!];
  const secondSales = (await prisma.membership.findFirst({
    where: { organizationId: org.id, role: 'SALESPERSON', userId: { not: users.SALESPERSON } },
  }))?.userId;
  if (secondSales) salesIds.push(secondSales);

  const statuses = ['ACTIVE', 'ACTIVE', 'NEEDS_ATTENTION', 'DRAFT', 'READY'] as const;
  for (let i = 0; i < createdVehicles.length; i += 1) {
    const v = createdVehicles[i]!;
    const listerId = salesIds[i % salesIds.length]!;
    const status = statuses[i % statuses.length]!;
    const listing = await prisma.listing.create({
      data: {
        organizationId: org.id,
        vehicleId: v.id,
        listerId,
        channel: 'FACEBOOK_MARKETPLACE',
        status,
        description: `${v.title} — well maintained, ready to drive home today. Message us to schedule a test drive.`,
        descriptionProvider: 'template',
        priceCentsAtListing: v.priceCents,
        activatedAt: status === 'ACTIVE' ? new Date() : null,
        events: {
          create: [{ type: 'CREATED', message: 'Seed listing created' }],
        },
      },
    });
    if (status === 'NEEDS_ATTENTION') {
      await prisma.notification.create({
        data: {
          organizationId: org.id,
          userId: listerId,
          type: 'LISTING_NEEDS_ATTENTION',
          title: 'Listing needs attention',
          body: `${v.title} may be sold or repriced. Review and take down if needed.`,
          metadata: { listingId: listing.id },
        },
      });
    }
  }

  await prisma.auditLog.create({
    data: { organizationId: org.id, action: 'seed.completed', metadata: { users: demoUsers.length, vehicles: demoVehicles.length } },
  });

  console.log('Seed complete:');
  console.log(`  Org: ${org.name} (${org.slug})`);
  console.log('  Users (password: Password123!):');
  for (const u of demoUsers) console.log(`    - ${u.email} [${u.role}]`);
  console.log(`  Vehicles: ${createdVehicles.length}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
