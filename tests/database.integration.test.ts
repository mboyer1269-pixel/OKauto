import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db, sqlClient } from "@/db";
import { organizations, vehicles } from "@/db/schema";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const organizationIds: string[] = [];

describe.runIf(hasDatabase)("PostgreSQL tenant integration", () => {
  it("isolates identical stock numbers between organizations", async () => {
    const [first, second] = await db()
      .insert(organizations)
      .values([
        { name: "Integration One", slug: `integration-one-${crypto.randomUUID()}` },
        { name: "Integration Two", slug: `integration-two-${crypto.randomUUID()}` },
      ])
      .returning();
    if (!first || !second) throw new Error("Organizations not created.");
    organizationIds.push(first.id, second.id);
    await db().insert(vehicles).values([
      { organizationId: first.id, stockNumber: "SAME-STOCK", year: 2020, make: "Test", model: "One", priceCents: 100 },
      { organizationId: second.id, stockNumber: "SAME-STOCK", year: 2021, make: "Test", model: "Two", priceCents: 200 },
    ]);

    const visible = await db().select().from(vehicles).where(eq(vehicles.organizationId, first.id));
    expect(visible).toHaveLength(1);
    expect(visible[0]?.model).toBe("One");
  });

  it("enforces active-listing and vehicle identity database constraints through migrations", async () => {
    const constraints = await sqlClient()<{ indexname: string }[]>`
      select indexname from pg_indexes
      where schemaname = 'public'
        and indexname in ('vehicles_org_vin_uq', 'listings_active_vehicle_channel_uq')
    `;
    expect(constraints.map((row) => row.indexname).sort()).toEqual([
      "listings_active_vehicle_channel_uq",
      "vehicles_org_vin_uq",
    ]);
  });
});

afterAll(async () => {
  for (const id of organizationIds) await db().delete(organizations).where(eq(organizations.id, id));
  if (hasDatabase) await sqlClient().end();
});
