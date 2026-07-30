import { eq } from "drizzle-orm";
import { loadConfig } from "../config.js";
import { hashPassword } from "../lib/password.js";
import { createDb, type Db } from "./client.js";
import { runMigrations } from "./migrate.js";
import {
  listingEvents, listings, notifications, orgMemberships, organizations, priceHistory, users, vehicles,
} from "./schema.js";

/**
 * Demo data seeder. Idempotent: re-running updates nothing if the demo org
 * already exists. Credentials are for local/demo use only.
 */

export const DEMO_ACCOUNTS = {
  owner: { email: "owner@demomotors.test", password: "OpenLot-Demo-1", name: "Olivia Owner" },
  manager: { email: "manager@demomotors.test", password: "OpenLot-Demo-1", name: "Marcus Manager" },
  sales1: { email: "sam@demomotors.test", password: "OpenLot-Demo-1", name: "Sam Seller" },
  sales2: { email: "dana@demomotors.test", password: "OpenLot-Demo-1", name: "Dana Dealmaker" },
  admin: { email: "admin@openlot.test", password: "OpenLot-Demo-1", name: "Platform Admin" },
};

const DEMO_VEHICLES = [
  {
    vin: "1HGCM82633A004352", stockNumber: "P1001", year: 2003, make: "Honda", model: "Accord", trim: "EX V6",
    bodyStyle: "COUPE", mileage: 88412, priceCents: 899500, exteriorColor: "Graphite Pearl", interiorColor: "Black",
    transmission: "AUTOMATIC", fuelType: "GASOLINE", drivetrain: "FWD", engine: "3.0L V6", doors: 2,
    features: ["Leather seats", "Sunroof", "Alloy wheels"],
  },
  {
    vin: "5YJ3E1EA2KF317000", stockNumber: "P1002", year: 2019, make: "Tesla", model: "Model 3", trim: "Standard Range Plus",
    bodyStyle: "SEDAN", mileage: 41200, priceCents: 2745000, exteriorColor: "Pearl White", interiorColor: "Black",
    transmission: "AUTOMATIC", fuelType: "ELECTRIC", drivetrain: "RWD", engine: "Electric motor", doors: 4,
    features: ["Autopilot", "Glass roof", "Heated seats"],
  },
  {
    vin: "1FTFW1ET9DFC10312", stockNumber: "T2001", year: 2013, make: "Ford", model: "F-150", trim: "XLT SuperCrew",
    bodyStyle: "TRUCK", mileage: 112050, priceCents: 1899900, exteriorColor: "Oxford White", interiorColor: "Gray",
    transmission: "AUTOMATIC", fuelType: "GASOLINE", drivetrain: "FOUR_WD", engine: "3.5L V6 EcoBoost", doors: 4,
    features: ["Tow package", "Backup camera", "Bed liner"],
  },
  {
    vin: "2T1BURHE4JC970118", stockNumber: "P1003", year: 2018, make: "Toyota", model: "Corolla", trim: "LE",
    bodyStyle: "SEDAN", mileage: 52300, priceCents: 1549500, exteriorColor: "Classic Silver", interiorColor: "Ash",
    transmission: "CVT", fuelType: "GASOLINE", drivetrain: "FWD", engine: "1.8L I4", doors: 4,
    features: ["Adaptive cruise", "Lane assist", "Bluetooth"],
  },
  {
    vin: "1GNSKBKC6FR215366", stockNumber: "S3001", year: 2015, make: "Chevrolet", model: "Tahoe", trim: "LT",
    bodyStyle: "SUV", mileage: 98750, priceCents: 2650000, exteriorColor: "Black", interiorColor: "Cocoa/Dune",
    transmission: "AUTOMATIC", fuelType: "GASOLINE", drivetrain: "FOUR_WD", engine: "5.3L V8", doors: 4,
    features: ["Third row", "Leather", "Tow package", "Remote start"],
  },
  {
    vin: "WBA8E9G58GNT43708", stockNumber: "P1004", year: 2016, make: "BMW", model: "328i", trim: "xDrive",
    bodyStyle: "SEDAN", mileage: 67420, priceCents: 1795000, exteriorColor: "Alpine White", interiorColor: "Oyster",
    transmission: "AUTOMATIC", fuelType: "GASOLINE", drivetrain: "AWD", engine: "2.0L I4 Turbo", doors: 4,
    features: ["Navigation", "Heated seats", "Moonroof"],
  },
] as const;

export async function seed(db: Db): Promise<{ orgId: string } | null> {
  const [existing] = await db.select().from(organizations).where(eq(organizations.slug, "demo-motors")).limit(1);
  if (existing) {
    console.log("Demo org already exists; skipping seed.");
    return null;
  }

  const passwordHash = await hashPassword(DEMO_ACCOUNTS.owner.password);
  const insertUser = async (account: { email: string; name: string }, isPlatformAdmin = false) => {
    const [user] = await db
      .insert(users)
      .values({ email: account.email, name: account.name, passwordHash, isPlatformAdmin })
      .returning();
    return user!;
  };

  const owner = await insertUser(DEMO_ACCOUNTS.owner);
  const manager = await insertUser(DEMO_ACCOUNTS.manager);
  const sales1 = await insertUser(DEMO_ACCOUNTS.sales1);
  const sales2 = await insertUser(DEMO_ACCOUNTS.sales2);
  await insertUser(DEMO_ACCOUNTS.admin, true);

  const [org] = await db
    .insert(organizations)
    .values({
      name: "Demo Motors",
      slug: "demo-motors",
      phone: "(555) 010-2030",
      website: "https://demomotors.test",
      addressLine: "500 Auto Row",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      settings: { descriptionTone: "PROFESSIONAL", includeDisclaimer: true, staleListingDays: 7 },
    })
    .returning();

  await db.insert(orgMemberships).values([
    { orgId: org!.id, userId: owner.id, role: "OWNER" },
    { orgId: org!.id, userId: manager.id, role: "MANAGER" },
    { orgId: org!.id, userId: sales1.id, role: "SALESPERSON" },
    { orgId: org!.id, userId: sales2.id, role: "SALESPERSON" },
  ]);

  const vehicleIds: string[] = [];
  for (const v of DEMO_VEHICLES) {
    const [row] = await db
      .insert(vehicles)
      .values({
        orgId: org!.id,
        vin: v.vin,
        stockNumber: v.stockNumber,
        year: v.year,
        make: v.make,
        model: v.model,
        trim: v.trim,
        bodyStyle: v.bodyStyle,
        condition: "USED",
        mileage: v.mileage,
        priceCents: v.priceCents,
        exteriorColor: v.exteriorColor,
        interiorColor: v.interiorColor,
        transmission: v.transmission,
        fuelType: v.fuelType,
        drivetrain: v.drivetrain,
        engine: v.engine,
        doors: v.doors,
        features: [...v.features],
        photoUrls: [],
        status: "AVAILABLE",
        source: "MANUAL",
      })
      .returning({ id: vehicles.id });
    vehicleIds.push(row!.id);
    await db.insert(priceHistory).values({ vehicleId: row!.id, priceCents: v.priceCents, source: "SEED" });
  }

  // A couple of listings with history so dashboards have data.
  const [listing1] = await db
    .insert(listings)
    .values({
      orgId: org!.id,
      vehicleId: vehicleIds[1]!,
      userId: sales1.id,
      status: "ACTIVE",
      preparedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    })
    .returning();
  await db.insert(listingEvents).values([
    { listingId: listing1!.id, actorUserId: sales1.id, type: "PREPARED", message: "Draft prepared via extension" },
    { listingId: listing1!.id, actorUserId: sales1.id, type: "PUBLISHED", message: "Published on Marketplace" },
  ]);

  const [listing2] = await db
    .insert(listings)
    .values({
      orgId: org!.id,
      vehicleId: vehicleIds[2]!,
      userId: sales2.id,
      status: "PREPARED",
      preparedAt: new Date(),
    })
    .returning();
  await db.insert(listingEvents).values([
    { listingId: listing2!.id, actorUserId: sales2.id, type: "PREPARED", message: "Draft prepared via extension" },
  ]);

  await db.insert(notifications).values({
    orgId: org!.id,
    userId: sales1.id,
    type: "SYSTEM",
    title: "Welcome to OpenLot",
    body: "Install the Chrome extension and connect your account to start listing vehicles.",
    meta: {},
  });

  console.log("Seeded demo org:", org!.id);
  console.log("Demo logins (password: OpenLot-Demo-1):");
  for (const acct of Object.values(DEMO_ACCOUNTS)) console.log(` - ${acct.email}`);
  return { orgId: org!.id };
}

import path from "node:path";
import { fileURLToPath } from "node:url";
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  const config = loadConfig();
  runMigrations(config.DATABASE_URL)
    .then(async () => {
      const { db, close } = createDb(config.DATABASE_URL);
      await seed(db);
      await close();
      process.exit(0);
    })
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
