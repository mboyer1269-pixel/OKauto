import { hash } from "bcryptjs";
import { and, eq } from "drizzle-orm";

import { db, sqlClient } from "../src/db";
import { inventorySources, memberships, organizations, users, vehicleMedia, vehicles } from "../src/db/schema";

const [organization] = await db()
  .insert(organizations)
  .values({
    name: "Northstar Motors",
    slug: "northstar-demo",
    timezone: "America/Chicago",
    settings: { staleGraceHours: 24, descriptionVoice: "clear" },
  })
  .onConflictDoUpdate({ target: organizations.slug, set: { name: "Northstar Motors", updatedAt: new Date() } })
  .returning();
if (!organization) throw new Error("Could not seed organization.");

const [owner] = await db()
  .insert(users)
  .values({
    email: "owner@demo.driveflow.local",
    name: "Jordan Rivera",
    passwordHash: await hash("DemoDrive!2026", 12),
  })
  .onConflictDoUpdate({
    target: users.email,
    set: { name: "Jordan Rivera", passwordHash: await hash("DemoDrive!2026", 12), status: "ACTIVE", updatedAt: new Date() },
  })
  .returning();
if (!owner) throw new Error("Could not seed owner.");

await db()
  .insert(memberships)
  .values({ organizationId: organization.id, userId: owner.id, role: "OWNER" })
  .onConflictDoUpdate({
    target: [memberships.organizationId, memberships.userId],
    set: { role: "OWNER" },
  });

let [source] = await db()
  .select()
  .from(inventorySources)
  .where(and(eq(inventorySources.organizationId, organization.id), eq(inventorySources.name, "Demo DMS feed")))
  .limit(1);
source ??= (
  await db()
    .insert(inventorySources)
    .values({ organizationId: organization.id, type: "JSON", name: "Demo DMS feed", status: "HEALTHY", lastSuccessAt: new Date() })
    .returning()
)[0];
if (!source) throw new Error("Could not seed source.");

const demoVehicles = [
  { vin: "1HGCM82633A004352", stockNumber: "N24017", year: 2022, make: "Honda", model: "Accord", trim: "Sport", mileage: 28450, priceCents: 2699500, exteriorColor: "Sonic Gray", transmission: "Automatic", fuelType: "Gasoline", bodyStyle: "Sedan" },
  { vin: "1M8GDM9AXKP042788", stockNumber: "N24023", year: 2021, make: "Ford", model: "F-150", trim: "XLT", mileage: 41200, priceCents: 3375000, exteriorColor: "Oxford White", transmission: "Automatic", fuelType: "Gasoline", bodyStyle: "Truck" },
  { vin: "5YJ3E1EA7KF317000", stockNumber: "N24031", year: 2023, make: "Toyota", model: "RAV4", trim: "XLE", mileage: 17680, priceCents: 3199000, exteriorColor: "Blueprint", transmission: "Automatic", fuelType: "Gasoline", bodyStyle: "SUV" },
] as const;

for (const item of demoVehicles) {
  const [vehicle] = await db()
    .insert(vehicles)
    .values({ ...item, organizationId: organization.id, sourceId: source.id, status: "AVAILABLE", facts: { demo: true } })
    .onConflictDoUpdate({
      target: [vehicles.organizationId, vehicles.vin],
      set: { ...item, sourceId: source.id, status: "AVAILABLE", lastSeenAt: new Date(), updatedAt: new Date() },
    })
    .returning();
  if (!vehicle) continue;
  await db().delete(vehicleMedia).where(eq(vehicleMedia.vehicleId, vehicle.id));
  await db().insert(vehicleMedia).values({
    vehicleId: vehicle.id,
    position: 0,
    url: `https://placehold.co/1200x800/dae8e1/214c3a.png?text=${encodeURIComponent(`${item.year} ${item.make} ${item.model}`)}`,
  });
}

console.info("Seed complete: owner@demo.driveflow.local / DemoDrive!2026");
await sqlClient().end();
