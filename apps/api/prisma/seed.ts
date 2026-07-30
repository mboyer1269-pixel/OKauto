import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding OKauto demo data...');

  await prisma.listingEvent.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.descriptionGeneration.deleteMany();
  await prisma.vehicleMedia.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.syncRun.deleteMany();
  await prisma.inventorySource.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.apiToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.dealership.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await argon2.hash('Password123!', { type: argon2.argon2id });

  const owner = await prisma.user.create({
    data: {
      email: 'owner@okauto.demo',
      passwordHash,
      firstName: 'Avery',
      lastName: 'Owner',
    },
  });
  const manager = await prisma.user.create({
    data: {
      email: 'manager@okauto.demo',
      passwordHash,
      firstName: 'Morgan',
      lastName: 'Manager',
    },
  });
  const sales1 = await prisma.user.create({
    data: {
      email: 'sales1@okauto.demo',
      passwordHash,
      firstName: 'Sam',
      lastName: 'Seller',
    },
  });
  const sales2 = await prisma.user.create({
    data: {
      email: 'sales2@okauto.demo',
      passwordHash,
      firstName: 'Riley',
      lastName: 'Rep',
    },
  });

  const org = await prisma.organization.create({
    data: { name: 'Horizon Motors Group', slug: 'horizon-motors' },
  });

  const rooftop = await prisma.dealership.create({
    data: {
      organizationId: org.id,
      name: 'Horizon Motors — Downtown',
      website: 'https://example-dealership.invalid',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      phone: '512-555-0100',
      timezone: 'America/Chicago',
    },
  });

  await prisma.membership.createMany({
    data: [
      { userId: owner.id, organizationId: org.id, dealershipId: rooftop.id, role: 'owner' },
      { userId: manager.id, organizationId: org.id, dealershipId: rooftop.id, role: 'manager' },
      { userId: sales1.id, organizationId: org.id, dealershipId: rooftop.id, role: 'salesperson' },
      { userId: sales2.id, organizationId: org.id, dealershipId: rooftop.id, role: 'salesperson' },
    ],
  });

  const source = await prisma.inventorySource.create({
    data: {
      dealershipId: rooftop.id,
      name: 'Demo CSV Feed',
      type: 'csv',
      config: { note: 'seeded' },
      lastSyncAt: new Date(),
      lastStatus: 'succeeded',
    },
  });

  const demoVehicles = [
    {
      vin: '1HGCM82633A004352',
      stockNumber: 'H1001',
      year: 2021,
      make: 'Honda',
      model: 'Accord',
      trim: 'Sport',
      exteriorColor: 'Crystal Black',
      mileage: 28450,
      price: 24990,
      photoUrls: [
        'https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=800',
        'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800',
      ],
    },
    {
      vin: '4T1BF1FK5HU648221',
      stockNumber: 'T2044',
      year: 2019,
      make: 'Toyota',
      model: 'Camry',
      trim: 'XSE',
      exteriorColor: 'Supersonic Red',
      mileage: 41200,
      price: 21950,
      photoUrls: ['https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800'],
    },
    {
      vin: '1FTFW1E59MFA12345',
      stockNumber: 'F3301',
      year: 2021,
      make: 'Ford',
      model: 'F-150',
      trim: 'XLT',
      exteriorColor: 'Oxford White',
      mileage: 35600,
      price: 38900,
      photoUrls: ['https://images.unsplash.com/photo-1605893477799-b99e3b8b93c0?w=800'],
    },
    {
      vin: '5YJ3E1EA1KF123456',
      stockNumber: 'E8802',
      year: 2019,
      make: 'Tesla',
      model: 'Model 3',
      trim: 'Long Range',
      exteriorColor: 'Pearl White',
      mileage: 52100,
      price: 27900,
      photoUrls: ['https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800'],
    },
    {
      vin: '1G1ZD5ST8LF012345',
      stockNumber: 'C5500',
      year: 2020,
      make: 'Chevrolet',
      model: 'Malibu',
      trim: 'LT',
      exteriorColor: 'Silver Ice',
      mileage: 47800,
      price: 17495,
      status: 'sold' as const,
      photoUrls: ['https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800'],
    },
  ];

  for (const v of demoVehicles) {
    const { photoUrls, status, ...rest } = v;
    const vehicle = await prisma.vehicle.create({
      data: {
        dealershipId: rooftop.id,
        sourceId: source.id,
        ...rest,
        status: status ?? 'available',
        soldAt: status === 'sold' ? new Date() : undefined,
        lastSeenAt: new Date(),
        description: `${rest.year} ${rest.make} ${rest.model} ${rest.trim} in ${rest.exteriorColor}.`,
        media: {
          create: photoUrls.map((url, i) => ({ url, sortOrder: i })),
        },
      },
    });

    if (status !== 'sold') {
      const listing = await prisma.listing.create({
        data: {
          vehicleId: vehicle.id,
          dealershipId: rooftop.id,
          salespersonId: sales1.id,
          status: 'prepared',
          title: `${rest.year} ${rest.make} ${rest.model} ${rest.trim}`,
          price: rest.price,
          description: `Check out this ${rest.year} ${rest.make} ${rest.model}. Stock #${rest.stockNumber}.`,
        },
      });
      await prisma.listingEvent.create({
        data: {
          listingId: listing.id,
          actorId: sales1.id,
          type: 'prepared',
          meta: { seed: true },
        },
      });
    }
  }

  await prisma.notification.create({
    data: {
      userId: sales1.id,
      type: 'sold_vehicle',
      title: 'Vehicle sold — remove Marketplace listing',
      body: '2020 Chevrolet Malibu appears sold in inventory. Please remove your Marketplace listing.',
      payload: { stockNumber: 'C5500' },
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      actorId: owner.id,
      action: 'seed.completed',
      entityType: 'organization',
      entityId: org.id,
      meta: { vehicles: demoVehicles.length },
    },
  });

  console.log('Seed complete.');
  console.log('Demo logins (password: Password123!):');
  console.log('  owner@okauto.demo');
  console.log('  manager@okauto.demo');
  console.log('  sales1@okauto.demo');
  console.log('  sales2@okauto.demo');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
