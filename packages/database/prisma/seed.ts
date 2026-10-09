import {
  PrismaClient,
  Role,
  VehicleStatus,
  ListingStatus,
  NotificationType,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { shouldCreateDemoAccounts } from '../src/demo-seed';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo1234!';

const SAMPLE_VEHICLES = [
  { vin: '1HGBH41JXMN109186', stockNumber: 'DM1001', year: 2022, make: 'Honda', model: 'Accord', trim: 'Sport', mileage: 28450, price: 24995, exteriorColor: 'Crystal Black', transmission: 'CVT', fuelType: 'Gasoline' },
  { vin: '2T1BURHE0JC123456', stockNumber: 'DM1002', year: 2021, make: 'Toyota', model: 'Camry', trim: 'SE', mileage: 35200, price: 22995, exteriorColor: 'Super White', transmission: 'Automatic', fuelType: 'Gasoline' },
  { vin: '3VWDP7AJ5DM123789', stockNumber: 'DM1003', year: 2020, make: 'Volkswagen', model: 'Jetta', trim: 'S', mileage: 42100, price: 16995, exteriorColor: 'Platinum Gray', transmission: 'Automatic', fuelType: 'Gasoline' },
  { vin: '1FTEW1EP5KFA12345', stockNumber: 'DM1004', year: 2019, make: 'Ford', model: 'F-150', trim: 'XLT', mileage: 67800, price: 32995, exteriorColor: 'Oxford White', transmission: 'Automatic', fuelType: 'Gasoline', bodyStyle: 'Truck' },
  { vin: '5YJ3E1EA1KF123456', stockNumber: 'DM1005', year: 2023, make: 'Tesla', model: 'Model 3', trim: 'Long Range', mileage: 12400, price: 38995, exteriorColor: 'Pearl White', transmission: 'Automatic', fuelType: 'Electric' },
  { vin: '1G1ZD5ST0LF123456', stockNumber: 'DM1006', year: 2020, make: 'Chevrolet', model: 'Malibu', trim: 'LT', mileage: 38900, price: 18995, exteriorColor: 'Summit White', transmission: 'Automatic', fuelType: 'Gasoline' },
  { vin: 'JN1BJ1CP0KW123456', stockNumber: 'DM1007', year: 2021, make: 'Nissan', model: 'Altima', trim: 'SV', mileage: 29800, price: 21995, exteriorColor: 'Gun Metallic', transmission: 'CVT', fuelType: 'Gasoline' },
  { vin: '5NPE34AF4HH123456', stockNumber: 'DM1008', year: 2019, make: 'Hyundai', model: 'Sonata', trim: 'SEL', mileage: 51200, price: 15995, exteriorColor: 'Symphony Silver', transmission: 'Automatic', fuelType: 'Gasoline' },
  { vin: '1C4RJFBG0LC123456', stockNumber: 'DM1009', year: 2022, make: 'Jeep', model: 'Grand Cherokee', trim: 'Laredo', mileage: 22100, price: 36995, exteriorColor: 'Diamond Black', transmission: 'Automatic', fuelType: 'Gasoline', bodyStyle: 'SUV' },
  { vin: 'WBA8E9G50JNU12345', stockNumber: 'DM1010', year: 2020, make: 'BMW', model: '330i', trim: 'Sport', mileage: 31500, price: 31995, exteriorColor: 'Alpine White', transmission: 'Automatic', fuelType: 'Gasoline' },
  { vin: 'WAUZZZ8V5KA123456', stockNumber: 'DM1011', year: 2021, make: 'Audi', model: 'A4', trim: 'Premium', mileage: 27600, price: 29995, exteriorColor: 'Daytona Gray', transmission: 'Automatic', fuelType: 'Gasoline' },
  { vin: '1FTFW1E84MFA12345', stockNumber: 'DM1012', year: 2022, make: 'Ford', model: 'Bronco', trim: 'Outer Banks', mileage: 18900, price: 42995, exteriorColor: 'Cactus Gray', transmission: 'Automatic', fuelType: 'Gasoline', bodyStyle: 'SUV' },
  { vin: '1C6RR7LT0ES123456', stockNumber: 'DM1013', year: 2018, make: 'Ram', model: '1500', trim: 'Big Horn', mileage: 72400, price: 27995, exteriorColor: 'Granite Crystal', transmission: 'Automatic', fuelType: 'Gasoline', bodyStyle: 'Truck' },
  { vin: 'KM8J3CA12NU123456', stockNumber: 'DM1014', year: 2023, make: 'Hyundai', model: 'Tucson', trim: 'SEL', mileage: 8900, price: 26995, exteriorColor: 'Shimmer Silver', transmission: 'Automatic', fuelType: 'Gasoline', bodyStyle: 'SUV' },
  { vin: '3FA6P0HD2KR123456', stockNumber: 'DM1015', year: 2019, make: 'Ford', model: 'Fusion', trim: 'SE', mileage: 55300, price: 14995, exteriorColor: 'Magnetic', transmission: 'Automatic', fuelType: 'Gasoline', status: VehicleStatus.SOLD },
];

function generateDescription(v: (typeof SAMPLE_VEHICLES)[0]): string {
  return `${v.year} ${v.make} ${v.model} ${v.trim || ''}, ${v.mileage?.toLocaleString('fr-CA')} km. ${v.exteriorColor ? `Couleur extérieure : ${v.exteriorColor}.` : ''} Communiquez avec Michael Boyer chez Buckingham Chevrolet Buick GMC pour planifier une visite.`;
}

function placeholderPhoto(make: string, model: string, year: number): string {
  const text = encodeURIComponent(`${year} ${make} ${model}`);
  return `https://placehold.co/800x600/1e293b/94a3b8?text=${text}`;
}

async function main() {
  console.log('🌱 Seeding database...');

  if (!shouldCreateDemoAccounts()) {
    console.log(
      'Seed skipped: demo accounts are never created when NODE_ENV=production. Set ALLOW_DEMO_SEED=true only on a disposable local database.',
    );
    return;
  }

  const existingOwner = await prisma.user.findUnique({
    where: { email: 'owner@demo.okauto.local' },
    select: { id: true },
  });
  if (existingOwner) {
    await prisma.user.update({
      where: { id: existingOwner.id },
      data: { name: 'Michael Boyer' },
    });
    await prisma.user.updateMany({
      where: { email: 'manager@demo.okauto.local' },
      data: { name: 'Direction des ventes' },
    });
    await prisma.user.updateMany({
      where: { email: 'sales@demo.okauto.local' },
      data: { name: 'Équipe Marketplace' },
    });
    console.log('✓ Database already initialized; existing dealership data was preserved.');
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const owner = await prisma.user.upsert({
    where: { email: 'owner@demo.okauto.local' },
    update: { name: 'Michael Boyer' },
    create: {
      email: 'owner@demo.okauto.local',
      passwordHash,
      name: 'Michael Boyer',
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@demo.okauto.local' },
    update: { name: 'Direction des ventes' },
    create: {
      email: 'manager@demo.okauto.local',
      passwordHash,
      name: 'Direction des ventes',
    },
  });

  const sales = await prisma.user.upsert({
    where: { email: 'sales@demo.okauto.local' },
    update: { name: 'Équipe Marketplace' },
    create: {
      email: 'sales@demo.okauto.local',
      passwordHash,
      name: 'Équipe Marketplace',
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: 'demo-motors' },
    update: {},
    create: {
      name: 'Buckingham Chevrolet Buick GMC',
      slug: 'demo-motors',
      website: 'https://www.buckinghamgm.com',
      phone: '819-986-6714',
      address: '975 Chemin de Masson',
      city: 'Gatineau',
      state: 'QC',
      zip: 'J8M 1R4',
      allInPriceConfirmedAt: new Date(),
      listingLanguage: 'fr_en',
    },
  });

  const members = [
    { userId: owner.id, role: Role.OWNER },
    { userId: manager.id, role: Role.MANAGER },
    { userId: sales.id, role: Role.SALESPERSON },
  ];

  for (const m of members) {
    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: { organizationId: org.id, userId: m.userId },
      },
      update: { role: m.role },
      create: { organizationId: org.id, userId: m.userId, role: m.role },
    });
  }

  await prisma.user.updateMany({
    where: { id: { in: [manager.id, sales.id] } },
    data: { provisionedByOrganizationId: org.id },
  });

  // Clear existing vehicles for clean re-seed
  await prisma.listingEvent.deleteMany({ where: { listing: { organizationId: org.id } } });
  await prisma.listing.deleteMany({ where: { organizationId: org.id } });
  await prisma.vehiclePhoto.deleteMany({ where: { vehicle: { organizationId: org.id } } });
  await prisma.vehicle.deleteMany({ where: { organizationId: org.id } });

  for (const v of SAMPLE_VEHICLES) {
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        assignedToId: sales.id,
        vin: v.vin,
        stockNumber: v.stockNumber,
        year: v.year,
        make: v.make,
        model: v.model,
        trim: v.trim,
        mileage: v.mileage,
        price: v.price,
        exteriorColor: v.exteriorColor,
        transmission: v.transmission,
        fuelType: v.fuelType,
        bodyStyle: v.bodyStyle,
        status: v.status ?? VehicleStatus.AVAILABLE,
        description: generateDescription(v),
        soldAt: v.status === VehicleStatus.SOLD ? new Date() : undefined,
        photos: {
          create: [
            {
              url: placeholderPhoto(v.make, v.model, v.year),
              sortOrder: 0,
              isPrimary: true,
            },
            {
              url: placeholderPhoto(v.make, `${v.model} Interior`, v.year),
              sortOrder: 1,
              isPrimary: false,
            },
          ],
        },
      },
    });

    // Create sample listings for first 5 vehicles
    if (SAMPLE_VEHICLES.indexOf(v) < 5) {
      await prisma.listing.create({
        data: {
          organizationId: org.id,
          vehicleId: vehicle.id,
          userId: sales.id,
          status: ListingStatus.ACTIVE,
          priceAtListing: v.price,
          events: {
            create: {
              eventType: 'listing_created',
              metadata: { source: 'seed' },
            },
          },
        },
      });
    }
  }

  // Sold alert notification
  await prisma.notification.create({
    data: {
      userId: sales.id,
      type: NotificationType.SOLD_ALERT,
      title: 'Vehicle Sold — Remove Listing',
      message:
        'The 2019 Ford Fusion (Stock DM1015) has been marked as sold. Please remove it from Facebook Marketplace.',
      metadata: { stockNumber: 'DM1015', vehicleId: 'seed' },
    },
  });

  // Demo API key for extension
  const apiKeyRaw = 'okauto_demo_' + crypto.randomBytes(24).toString('hex');
  const keyHash = crypto.createHash('sha256').update(apiKeyRaw).digest('hex');
  await prisma.apiKey.deleteMany({ where: { organizationId: org.id, name: 'Demo Extension Key' } });
  await prisma.apiKey.create({
    data: {
      organizationId: org.id,
      userId: sales.id,
      name: 'Demo Extension Key',
      keyHash,
      keyPrefix: apiKeyRaw.slice(0, 12),
    },
  });

  await prisma.syncSource.upsert({
    where: { id: 'seed-sync-source' },
    update: {},
    create: {
      id: 'seed-sync-source',
      organizationId: org.id,
      name: 'Demo Website Feed',
      url: 'https://demo-motors.example.com/inventory.json',
      adapter: 'generic',
      isActive: true,
      intervalMinutes: 60,
    },
  });

  console.log('✅ Seed complete!');
  console.log('');
  console.log('Demo credentials:');
  console.log('  Owner:       owner@demo.okauto.local / Demo1234!');
  console.log('  Manager:     manager@demo.okauto.local / Demo1234!');
  console.log('  Salesperson: sales@demo.okauto.local / Demo1234!');
  console.log('');
  console.log('Extension API key:', apiKeyRaw);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
