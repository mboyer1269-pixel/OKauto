import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BuiltServer } from "../server.js";
import { authHeaders, buildTestServer, createVehicleDirect, registerOrg, resetDb, testPrisma } from "./helpers.js";

let server: BuiltServer;

beforeAll(async () => {
  server = await buildTestServer();
});
afterAll(async () => {
  await server.app.close();
});
beforeEach(async () => {
  await resetDb();
});

describe("vehicles", () => {
  it("creates a vehicle with VIN enrichment and price history", async () => {
    const account = await registerOrg(server.app, { email: "v@test.dev", orgName: "V Motors" });
    const res = await server.app.inject({
      method: "POST",
      url: "/api/v1/vehicles",
      headers: authHeaders(account),
      payload: {
        vin: "1HGCM82633A004352",
        make: "Honda",
        model: "Accord",
        priceCents: 599500,
        mileage: 98400,
        photoUrls: ["https://cdn.test.dev/1.jpg", "https://cdn.test.dev/2.jpg"],
      },
    });
    expect(res.statusCode).toBe(201);
    const { vehicle } = res.json() as { vehicle: { id: string; year: number | null; vin: string } };
    expect(vehicle.vin).toBe("1HGCM82633A004352");
    expect(vehicle.year).toBe(2003); // decoded from VIN

    const prisma = testPrisma();
    const photos = await prisma.vehiclePhoto.findMany({ where: { vehicleId: vehicle.id } });
    expect(photos).toHaveLength(2);
    const history = await prisma.priceHistory.findMany({ where: { vehicleId: vehicle.id } });
    expect(history).toHaveLength(1);
  });

  it("dedupes on VIN: re-creating updates instead of duplicating", async () => {
    const account = await registerOrg(server.app, { email: "v2@test.dev", orgName: "V2 Motors" });
    const payload = { vin: "1HGCM82633A004352", make: "Honda", model: "Accord", priceCents: 599500 };
    const first = await server.app.inject({ method: "POST", url: "/api/v1/vehicles", headers: authHeaders(account), payload });
    expect(first.statusCode).toBe(201);

    const second = await server.app.inject({
      method: "POST",
      url: "/api/v1/vehicles",
      headers: authHeaders(account),
      payload: { ...payload, priceCents: 579500 },
    });
    expect(second.statusCode).toBe(200); // updated, not created

    const prisma = testPrisma();
    const count = await prisma.vehicle.count({ where: { orgId: account.orgId } });
    expect(count).toBe(1);
    const vehicle = await prisma.vehicle.findFirst({ where: { orgId: account.orgId } });
    expect(vehicle?.priceCents).toBe(579500);
    expect(vehicle?.status).toBe("PRICE_CHANGED");
    const history = await prisma.priceHistory.findMany({ where: { vehicleId: vehicle!.id } });
    expect(history).toHaveLength(2);
  });

  it("invalid VIN falls back to stock-number dedupe with a warning", async () => {
    const account = await registerOrg(server.app, { email: "v3@test.dev", orgName: "V3 Motors" });
    const res = await server.app.inject({
      method: "POST",
      url: "/api/v1/vehicles",
      headers: authHeaders(account),
      payload: { vin: "BADVIN123", stockNumber: "ST-100", make: "Ford", model: "Focus", priceCents: 899500 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { stats: { warnings: { messages: string[] }[] }; vehicle: { vin: string | null } };
    expect(body.vehicle.vin).toBeNull();
    expect(body.stats.warnings.length).toBeGreaterThan(0);
  });

  it("lists with filters + cursor pagination", async () => {
    const account = await registerOrg(server.app, { email: "v4@test.dev", orgName: "V4 Motors" });
    const prisma = testPrisma();
    for (let i = 0; i < 7; i += 1) {
      await createVehicleDirect(prisma, account.orgId, { stockNumber: `S-${i}`, make: i % 2 ? "Ford" : "Honda" });
    }
    const page1 = await server.app.inject({
      method: "GET",
      url: "/api/v1/vehicles?limit=3",
      headers: authHeaders(account),
    });
    const body1 = page1.json() as { items: { id: string }[]; nextCursor: string | null };
    expect(body1.items).toHaveLength(3);
    expect(body1.nextCursor).not.toBeNull();

    const page2 = await server.app.inject({
      method: "GET",
      url: `/api/v1/vehicles?limit=3&cursor=${encodeURIComponent(body1.nextCursor!)}`,
      headers: authHeaders(account),
    });
    const body2 = page2.json() as { items: { id: string }[]; nextCursor: string | null };
    expect(body2.items).toHaveLength(3);
    const ids = new Set([...body1.items, ...body2.items].map((v) => v.id));
    expect(ids.size).toBe(6); // no overlap between pages

    const filtered = await server.app.inject({
      method: "GET",
      url: "/api/v1/vehicles?make=honda",
      headers: authHeaders(account),
    });
    const filteredBody = filtered.json() as { items: { make: string }[] };
    expect(filteredBody.items.length).toBeGreaterThan(0);
    expect(filteredBody.items.every((v) => v.make === "Honda")).toBe(true);
  });

  it("mark-sold sets vehicle SOLD and routes live listings to NEEDS_REMOVAL", async () => {
    const account = await registerOrg(server.app, { email: "v5@test.dev", orgName: "V5 Motors" });
    const prisma = testPrisma();
    const vehicle = await createVehicleDirect(prisma, account.orgId, {});
    const listing = await prisma.listing.create({
      data: {
        orgId: account.orgId,
        vehicleId: vehicle.id,
        status: "LIVE",
        title: "2020 Toyota Camry",
        assigneeId: account.userId,
        createdById: account.userId,
        postedAt: new Date(),
      },
    });

    const res = await server.app.inject({
      method: "POST",
      url: `/api/v1/vehicles/${vehicle.id}/mark-sold`,
      headers: authHeaders(account),
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    const updated = await prisma.vehicle.findUnique({ where: { id: vehicle.id } });
    expect(updated?.status).toBe("SOLD");
    expect(updated?.soldAt).not.toBeNull();
    const updatedListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(updatedListing?.status).toBe("NEEDS_REMOVAL");
  });

  it("manual price edit records MANUAL price history", async () => {
    const account = await registerOrg(server.app, { email: "v6@test.dev", orgName: "V6 Motors" });
    const prisma = testPrisma();
    const vehicle = await createVehicleDirect(prisma, account.orgId, { priceCents: 1000000 });
    const res = await server.app.inject({
      method: "PATCH",
      url: `/api/v1/vehicles/${vehicle.id}`,
      headers: authHeaders(account),
      payload: { priceCents: 949500 },
    });
    expect(res.statusCode).toBe(200);
    const history = await prisma.priceHistory.findFirst({
      where: { vehicleId: vehicle.id, source: "MANUAL", changedById: account.userId },
    });
    expect(history?.priceCents).toBe(949500);
    const updated = await prisma.vehicle.findUnique({ where: { id: vehicle.id } });
    expect(updated?.status).toBe("PRICE_CHANGED");
  });
});
