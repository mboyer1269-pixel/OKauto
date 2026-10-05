import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@okauto/database";
import { runSyncSource } from "../sync.js";

describe("runSyncSource", () => {
  let orgId: string;
  let sourceId: string;
  const testVin = "TESTSYNC123456789";

  beforeEach(async () => {
    const org = await prisma.organization.findFirst({
      where: { slug: "demo-motors" },
    });
    orgId = org!.id;

    const source = await prisma.syncSource.create({
      data: {
        organizationId: orgId,
        name: "Test Sync",
        url: "https://mock.test/inventory.json",
        adapter: "generic",
        isActive: true,
        intervalMinutes: 60,
      },
    });
    sourceId = source.id;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        text: async () =>
          JSON.stringify([
            {
              vin: testVin,
              year: 2024,
              make: "Test",
              model: "SyncCar",
              price: 25000,
              mileage: 1000,
              photos: ["https://example.com/car.jpg"],
            },
          ]),
      }),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await prisma.vehiclePhoto.deleteMany({
      where: { vehicle: { vin: testVin, organizationId: orgId } },
    });
    await prisma.vehicle.deleteMany({
      where: { vin: testVin, organizationId: orgId },
    });
    await prisma.notification.deleteMany({
      where: { metadata: { path: ["vin"], equals: testVin } },
    });
    await prisma.syncSource.deleteMany({ where: { id: sourceId } });
  });

  it("syncs vehicles from JSON feed", async () => {
    const result = await runSyncSource(sourceId);
    expect(result.synced).toBe(1);
    expect(result.errors).toBe(0);

    const vehicle = await prisma.vehicle.findFirst({
      where: { vin: testVin, organizationId: orgId },
      include: { photos: true },
    });
    expect(vehicle?.make).toBe("Test");
    expect(vehicle?.photos.length).toBe(1);
    expect(vehicle?.syncSourceId).toBe(sourceId);

    const source = await prisma.syncSource.findUnique({
      where: { id: sourceId },
    });
    expect(source?.lastSyncStatus).toBe("success");
  });

  it("detects price changes on re-sync", async () => {
    await runSyncSource(sourceId);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        text: async () =>
          JSON.stringify([
            {
              vin: testVin,
              year: 2024,
              make: "Test",
              model: "SyncCar",
              price: 23000,
            },
          ]),
      }),
    );

    const result = await runSyncSource(sourceId);
    expect(result.priceChanges).toBe(1);

    const notifications = await prisma.notification.findMany({
      where: { type: "PRICE_CHANGE" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    const formatted = (23000).toLocaleString("fr-CA");
    expect(notifications.some((n) => n.message.includes(formatted))).toBe(true);
  });

  it("marks vehicles sold only after two consecutive feed absences", async () => {
    await runSyncSource(sourceId);
    const [vehicle, member] = await Promise.all([
      prisma.vehicle.findFirstOrThrow({
        where: { vin: testVin, organizationId: orgId },
      }),
      prisma.organizationMember.findFirstOrThrow({
        where: { organizationId: orgId },
      }),
    ]);
    const listing = await prisma.listing.create({
      data: {
        organizationId: orgId,
        vehicleId: vehicle.id,
        userId: member.userId,
        status: "ACTIVE",
        externalUrl:
          "https://www.facebook.com/marketplace/item/test-sync-listing",
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        text: async () =>
          JSON.stringify([
            {
              vin: "TESTSYNC987654321",
              year: 2025,
              make: "Test",
              model: "Replacement",
              price: 30000,
            },
          ]),
      }),
    );

    const firstMissingResult = await runSyncSource(sourceId);
    expect(firstMissingResult.sold).toBe(0);

    const afterFirstMiss = await prisma.vehicle.findFirst({
      where: { vin: testVin, organizationId: orgId },
    });
    expect(afterFirstMiss?.status).toBe("AVAILABLE");
    expect(afterFirstMiss?.missingSyncCount).toBe(1);

    const result = await runSyncSource(sourceId);
    expect(result.sold).toBe(1);

    const removedVehicle = await prisma.vehicle.findFirst({
      where: { vin: testVin, organizationId: orgId },
    });
    expect(removedVehicle?.status).toBe("SOLD");
    expect(removedVehicle?.soldAt).not.toBeNull();
    const staleListing = await prisma.listing.findUnique({
      where: { id: listing.id },
    });
    expect(staleListing?.status).toBe("STALE");

    await prisma.vehicle.deleteMany({
      where: { vin: "TESTSYNC987654321", organizationId: orgId },
    });
  });

  it("marks source as error on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 500,
          headers: { get: () => null },
          text: async () => "",
        }),
    );

    await expect(runSyncSource(sourceId)).rejects.toThrow("HTTP 500");

    const source = await prisma.syncSource.findUnique({
      where: { id: sourceId },
    });
    expect(source?.lastSyncStatus).toBe("error");
  });
});
