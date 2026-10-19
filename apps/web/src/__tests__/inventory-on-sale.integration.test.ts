import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@okauto/database";
import { POST as loginHandler } from "@/app/api/v1/auth/login/route";
import { GET as vehiclesHandler } from "@/app/api/v1/vehicles/route";
import { GET as dashboardHandler } from "@/app/api/v1/analytics/dashboard/route";
import { GET as extensionInventoryHandler } from "@/app/api/v1/extension/route";
import { GET as extensionVehicleHandler } from "@/app/api/v1/extension/vehicles/[id]/route";
import { hashToken } from "@/lib/auth";

function makeRequest(url: string, options: RequestInit = {}): Request {
  return new Request(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });
}

describe("inventaire en vente — exclusion des vendus", () => {
  const stamp = Date.now();
  const email = `onsale-owner-${stamp}@example.com`;
  const password = "Demo1234!";
  let orgId: string;
  let accessToken: string;
  let apiKey: string;
  let apiKeyId: string;
  let availableIds: string[] = [];
  let soldIds: string[] = [];
  let absentId: string;
  let soldWithListingId: string;
  let listingId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: "Owner OnSale" },
    });
    const org = await prisma.organization.create({
      data: {
        name: "Concession OnSale",
        slug: `onsale-${stamp}`,
      },
    });
    orgId = org.id;
    await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });

    const created = await Promise.all(
      [1, 2, 3].map((index) =>
        prisma.vehicle.create({
          data: {
            organizationId: org.id,
            stockNumber: `OS-AVL-${stamp}-${index}`,
            year: 2024,
            make: "Honda",
            model: "Civic",
            status: "AVAILABLE",
            feedAbsenceStatus: "IN_FEED",
          },
        }),
      ),
    );
    availableIds = created.map((vehicle) => vehicle.id);

    const sold = await Promise.all(
      [1, 2].map((index) =>
        prisma.vehicle.create({
          data: {
            organizationId: org.id,
            stockNumber: `OS-SOLD-${stamp}-${index}`,
            year: 2020,
            make: "Ford",
            model: "Escape",
            status: "SOLD",
            soldAt: new Date(),
            feedAbsenceStatus: "IN_FEED",
          },
        }),
      ),
    );
    soldIds = sold.map((vehicle) => vehicle.id);

    const absent = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        stockNumber: `OS-ABS-${stamp}`,
        year: 2021,
        make: "Toyota",
        model: "Corolla",
        status: "AVAILABLE",
        feedAbsenceStatus: "PENDING_REVIEW",
      },
    });
    absentId = absent.id;

    const soldListed = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        stockNumber: `OS-LIVE-${stamp}`,
        year: 2019,
        make: "Mazda",
        model: "CX-5",
        status: "SOLD",
        soldAt: new Date(),
        feedAbsenceStatus: "IN_FEED",
      },
    });
    soldWithListingId = soldListed.id;
    const listing = await prisma.listing.create({
      data: {
        organizationId: org.id,
        vehicleId: soldListed.id,
        userId: user.id,
        platform: "facebook_marketplace",
        status: "ACTIVE",
        externalUrl: "https://www.facebook.com/marketplace/item/987654321",
      },
    });
    listingId = listing.id;

    apiKey = `okauto_test_onsale_${stamp}`;
    const key = await prisma.apiKey.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        name: "OnSale extension",
        keyHash: hashToken(apiKey),
        keyPrefix: apiKey.slice(0, 12),
      },
    });
    apiKeyId = key.id;

    const login = await loginHandler(
      makeRequest("http://localhost/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }) as never,
    );
    const loginData = await login.json();
    accessToken = loginData.accessToken;
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { id: listingId } });
    await prisma.vehicle.deleteMany({
      where: {
        id: { in: [...availableIds, ...soldIds, absentId, soldWithListingId] },
      },
    });
    await prisma.apiKey.deleteMany({ where: { id: apiKeyId } });
    await prisma.organizationMember.deleteMany({
      where: { organizationId: orgId },
    });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { email } });
  });

  it("compte 3 véhicules en vente (3 AVAILABLE, 2 SOLD, 1 absent du flux)", async () => {
    const res = await vehiclesHandler(
      makeRequest("http://localhost/api/v1/vehicles?limit=100", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      { params: Promise.resolve({}) },
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.pagination.total).toBe(3);
    const ids = data.vehicles.map((vehicle: { id: string }) => vehicle.id);
    expect(ids.sort()).toEqual([...availableIds].sort());
    expect(ids).not.toContain(soldIds[0]);
    expect(ids).not.toContain(absentId);
  });

  it("le filtre Vendus montre uniquement les SOLD", async () => {
    const res = await vehiclesHandler(
      makeRequest("http://localhost/api/v1/vehicles?scope=sold&limit=100", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      { params: Promise.resolve({}) },
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    const ids = data.vehicles.map((vehicle: { id: string }) => vehicle.id);
    expect(ids).toEqual(expect.arrayContaining([...soldIds, soldWithListingId]));
    expect(ids).not.toEqual(expect.arrayContaining(availableIds));
    expect(ids).not.toContain(absentId);
  });

  it("le tableau de bord n’ajoute pas les vendus à l’inventaire et signale l’annonce à retirer", async () => {
    const res = await dashboardHandler(
      makeRequest("http://localhost/api/v1/analytics/dashboard", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      { params: Promise.resolve({}) },
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.totalVehicles).toBe(3);
    expect(data.soldVehicles).toBe(3);
    expect(data.pendingFeedReview).toBe(1);
    expect(data.listingsToRemove).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: listingId,
          externalUrl: "https://www.facebook.com/marketplace/item/987654321",
          vehicle: expect.objectContaining({ id: soldWithListingId }),
        }),
      ]),
    );
  });

  it("l’extension ne reçoit que les véhicules en vente", async () => {
    const list = await extensionInventoryHandler(
      makeRequest("http://localhost/api/v1/extension?limit=50", {
        headers: { "X-API-Key": apiKey },
      }) as never,
    );
    const listData = await list.json();
    expect(list.status).toBe(200);
    expect(listData.pagination.total).toBe(3);
    const ids = listData.vehicles.map((vehicle: { id: string }) => vehicle.id);
    expect(ids.sort()).toEqual([...availableIds].sort());

    const soldDetail = await extensionVehicleHandler(
      makeRequest(
        `http://localhost/api/v1/extension/vehicles/${soldIds[0]}`,
        { headers: { "X-API-Key": apiKey } },
      ) as never,
      { params: Promise.resolve({ id: soldIds[0] }) },
    );
    expect(soldDetail.status).toBe(404);

    const availableDetail = await extensionVehicleHandler(
      makeRequest(
        `http://localhost/api/v1/extension/vehicles/${availableIds[0]}`,
        { headers: { "X-API-Key": apiKey } },
      ) as never,
      { params: Promise.resolve({ id: availableIds[0] }) },
    );
    expect(availableDetail.status).toBe(200);
  });
});
