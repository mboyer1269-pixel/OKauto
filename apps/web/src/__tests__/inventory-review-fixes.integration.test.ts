import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@okauto/database";
import { POST as loginHandler } from "@/app/api/v1/auth/login/route";
import { GET as listingsHandler } from "@/app/api/v1/listings/route";
import { GET as dashboardHandler } from "@/app/api/v1/analytics/dashboard/route";
import { GET as publishQueueHandler } from "@/app/api/v1/analytics/publish-queue/route";
import { GET as directorHandler } from "@/app/api/v1/analytics/director/route";
import { GET as vehiclesHandler } from "@/app/api/v1/vehicles/route";
import { GET as feedAbsenceHandler } from "@/app/api/v1/vehicles/feed-absence/route";
import { GET as extensionInventoryHandler } from "@/app/api/v1/extension/route";
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

describe("revue inventaire — renouveler, retirer, périmés", { timeout: 30_000 }, () => {
  const stamp = Date.now();
  const ownerEmail = `review-owner-${stamp}@example.com`;
  const salesEmail = `review-sales-${stamp}@example.com`;
  const password = "Demo1234!";
  const listedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const lastSeenStale = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const lastSeenFresh = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const lastSyncAfter = new Date(Date.now() - 30 * 60 * 1000);
  const lastSyncBefore = new Date(Date.now() - 80 * 60 * 60 * 1000);

  let orgId: string;
  let ownerToken: string;
  let salesToken: string;
  let apiKey: string;
  let apiKeyId: string;
  let onSaleSourceId: string;
  let failedSourceId: string;
  let lagSourceId: string;

  let onSaleVehicleId: string;
  let soldVehicleId: string;
  let absentVehicleId: string;
  let staleVehicleId: string;
  let manualVehicleId: string;
  let failedSourceVehicleId: string;
  let unseenButSourceLagVehicleId: string;
  let salesSoldVehicleId: string;

  let onSaleListingId: string;
  let soldListingId: string;
  let absentListingId: string;
  let staleListingId: string;
  let salesSoldListingId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 12);
    const owner = await prisma.user.create({
      data: { email: ownerEmail, passwordHash, name: "Owner Review" },
    });
    const sales = await prisma.user.create({
      data: { email: salesEmail, passwordHash, name: "Vendeur Review" },
    });
    const org = await prisma.organization.create({
      data: {
        name: "Concession Review",
        slug: `review-${stamp}`,
        listingRenewalDays: 7,
      },
    });
    orgId = org.id;
    await prisma.organizationMember.createMany({
      data: [
        { organizationId: org.id, userId: owner.id, role: "OWNER" },
        { organizationId: org.id, userId: sales.id, role: "SALESPERSON" },
      ],
    });

    const [onSaleSource, failedSource, lagSource] = await Promise.all([
      prisma.syncSource.create({
        data: {
          organizationId: org.id,
          name: "Flux OK",
          url: `https://example.com/review-ok-${stamp}.xml`,
          isActive: true,
          lastSyncStatus: "success",
          lastSyncAt: lastSyncAfter,
        },
      }),
      prisma.syncSource.create({
        data: {
          organizationId: org.id,
          name: "Flux erreur",
          url: `https://example.com/review-err-${stamp}.xml`,
          isActive: true,
          lastSyncStatus: "error",
          lastSyncAt: lastSyncAfter,
        },
      }),
      prisma.syncSource.create({
        data: {
          organizationId: org.id,
          name: "Flux en retard",
          url: `https://example.com/review-lag-${stamp}.xml`,
          isActive: true,
          lastSyncStatus: "success",
          lastSyncAt: lastSyncBefore,
        },
      }),
    ]);
    onSaleSourceId = onSaleSource.id;
    failedSourceId = failedSource.id;
    lagSourceId = lagSource.id;

    const [
      onSaleVehicle,
      soldVehicle,
      absentVehicle,
      staleVehicle,
      manualVehicle,
      failedSourceVehicle,
      unseenButSourceLag,
      salesSoldVehicle,
    ] = await Promise.all([
      prisma.vehicle.create({
        data: {
          organizationId: org.id,
          stockNumber: `RV-ON-${stamp}`,
          year: 2024,
          make: "Honda",
          model: "Civic",
          status: "AVAILABLE",
          feedAbsenceStatus: "IN_FEED",
          lastSeenAt: lastSeenFresh,
          syncSourceId: onSaleSource.id,
        },
      }),
      prisma.vehicle.create({
        data: {
          organizationId: org.id,
          stockNumber: `RV-SOLD-${stamp}`,
          year: 2020,
          make: "Ford",
          model: "Escape",
          status: "SOLD",
          soldAt: new Date(),
          feedAbsenceStatus: "IN_FEED",
        },
      }),
      prisma.vehicle.create({
        data: {
          organizationId: org.id,
          stockNumber: `RV-ABS-${stamp}`,
          year: 2021,
          make: "Toyota",
          model: "Corolla",
          status: "AVAILABLE",
          feedAbsenceStatus: "PENDING_REVIEW",
        },
      }),
      prisma.vehicle.create({
        data: {
          organizationId: org.id,
          stockNumber: `RV-STALE-${stamp}`,
          year: 2022,
          make: "Mazda",
          model: "CX-5",
          status: "AVAILABLE",
          feedAbsenceStatus: "IN_FEED",
          lastSeenAt: lastSeenStale,
          syncSourceId: onSaleSource.id,
        },
      }),
      prisma.vehicle.create({
        data: {
          organizationId: org.id,
          stockNumber: `RV-MAN-${stamp}`,
          year: 2018,
          make: "Kia",
          model: "Soul",
          status: "AVAILABLE",
          feedAbsenceStatus: "IN_FEED",
          lastSeenAt: lastSeenStale,
        },
      }),
      prisma.vehicle.create({
        data: {
          organizationId: org.id,
          stockNumber: `RV-FAIL-${stamp}`,
          year: 2019,
          make: "Hyundai",
          model: "Elantra",
          status: "AVAILABLE",
          feedAbsenceStatus: "IN_FEED",
          lastSeenAt: lastSeenStale,
          syncSourceId: failedSource.id,
        },
      }),
      prisma.vehicle.create({
        data: {
          organizationId: org.id,
          stockNumber: `RV-LAG-${stamp}`,
          year: 2017,
          make: "Nissan",
          model: "Rogue",
          status: "AVAILABLE",
          feedAbsenceStatus: "IN_FEED",
          lastSeenAt: lastSeenStale,
          syncSourceId: lagSource.id,
        },
      }),
      prisma.vehicle.create({
        data: {
          organizationId: org.id,
          stockNumber: `RV-SALES-${stamp}`,
          year: 2016,
          make: "Chevrolet",
          model: "Cruze",
          status: "SOLD",
          soldAt: new Date(),
          feedAbsenceStatus: "IN_FEED",
        },
      }),
    ]);

    onSaleVehicleId = onSaleVehicle.id;
    soldVehicleId = soldVehicle.id;
    absentVehicleId = absentVehicle.id;
    staleVehicleId = staleVehicle.id;
    manualVehicleId = manualVehicle.id;
    failedSourceVehicleId = failedSourceVehicle.id;
    unseenButSourceLagVehicleId = unseenButSourceLag.id;
    salesSoldVehicleId = salesSoldVehicle.id;

    const [
      onSaleListing,
      soldListing,
      absentListing,
      staleListing,
      salesSoldListing,
    ] = await Promise.all([
      prisma.listing.create({
        data: {
          organizationId: org.id,
          vehicleId: onSaleVehicle.id,
          userId: owner.id,
          platform: "facebook_marketplace",
          status: "ACTIVE",
          listedAt,
          externalUrl: "https://www.facebook.com/marketplace/item/111111111",
        },
      }),
      prisma.listing.create({
        data: {
          organizationId: org.id,
          vehicleId: soldVehicle.id,
          userId: owner.id,
          platform: "facebook_marketplace",
          status: "ACTIVE",
          listedAt,
          externalUrl: "https://www.facebook.com/marketplace/item/222222222",
        },
      }),
      prisma.listing.create({
        data: {
          organizationId: org.id,
          vehicleId: absentVehicle.id,
          userId: owner.id,
          platform: "facebook_marketplace",
          status: "ACTIVE",
          listedAt,
          externalUrl: "https://www.facebook.com/marketplace/item/333333333",
        },
      }),
      prisma.listing.create({
        data: {
          organizationId: org.id,
          vehicleId: staleVehicle.id,
          userId: owner.id,
          platform: "facebook_marketplace",
          status: "ACTIVE",
          listedAt,
          externalUrl: "https://www.facebook.com/marketplace/item/444444444",
        },
      }),
      prisma.listing.create({
        data: {
          organizationId: org.id,
          vehicleId: salesSoldVehicle.id,
          userId: sales.id,
          platform: "facebook_marketplace",
          status: "ACTIVE",
          listedAt,
          externalUrl: "https://www.facebook.com/marketplace/item/555555555",
        },
      }),
    ]);

    onSaleListingId = onSaleListing.id;
    soldListingId = soldListing.id;
    absentListingId = absentListing.id;
    staleListingId = staleListing.id;
    salesSoldListingId = salesSoldListing.id;

    apiKey = `okauto_test_review_${stamp}`;
    const key = await prisma.apiKey.create({
      data: {
        organizationId: org.id,
        userId: owner.id,
        name: "Review extension",
        keyHash: hashToken(apiKey),
        keyPrefix: apiKey.slice(0, 12),
      },
    });
    apiKeyId = key.id;

    const ownerLogin = await loginHandler(
      makeRequest("http://localhost/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: ownerEmail, password }),
      }) as never,
    );
    const salesLogin = await loginHandler(
      makeRequest("http://localhost/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: salesEmail, password }),
      }) as never,
    );
    ownerToken = (await ownerLogin.json()).accessToken;
    salesToken = (await salesLogin.json()).accessToken;
  }, 30_000);

  afterAll(async () => {
    await prisma.listing.deleteMany({
      where: {
        id: {
          in: [
            onSaleListingId,
            soldListingId,
            absentListingId,
            staleListingId,
            salesSoldListingId,
          ],
        },
      },
    });
    await prisma.vehicle.deleteMany({
      where: {
        id: {
          in: [
            onSaleVehicleId,
            soldVehicleId,
            absentVehicleId,
            staleVehicleId,
            manualVehicleId,
            failedSourceVehicleId,
            unseenButSourceLagVehicleId,
            salesSoldVehicleId,
          ],
        },
      },
    });
    await prisma.apiKey.deleteMany({ where: { id: apiKeyId } });
    await prisma.syncSource.deleteMany({
      where: { id: { in: [onSaleSourceId, failedSourceId, lagSourceId] } },
    });
    await prisma.organizationMember.deleteMany({
      where: { organizationId: orgId },
    });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({
      where: { email: { in: [ownerEmail, salesEmail] } },
    });
  });

  it("P1-1: À renouveler exclut vendus, absents et périmés sur les 3 surfaces", async () => {
    const [listingsRes, queueRes, directorRes] = await Promise.all([
      listingsHandler(
        makeRequest("http://localhost/api/v1/listings?limit=250", {
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
        { params: Promise.resolve({}) },
      ),
      publishQueueHandler(
        makeRequest("http://localhost/api/v1/analytics/publish-queue", {
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
        { params: Promise.resolve({}) },
      ),
      directorHandler(
        makeRequest("http://localhost/api/v1/analytics/director", {
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
        { params: Promise.resolve({}) },
      ),
    ]);

    const listingsData = await listingsRes.json();
    const queueData = await queueRes.json();
    const directorData = await directorRes.json();

    expect(listingsRes.status).toBe(200);
    expect(queueRes.status).toBe(200);
    expect(directorRes.status).toBe(200);

    expect(listingsData.counts.RENEW_DUE).toBe(1);
    expect(queueData.dueForRenewalCount).toBe(1);
    expect(directorData.dueForRenewalCount).toBe(1);

    expect(queueData.dueForRenewal.map((row: { id: string }) => row.id)).toEqual(
      [onSaleListingId],
    );
    expect(
      directorData.dueForRenewal.map((row: { id: string }) => row.id),
    ).toEqual([onSaleListingId]);

    const removalIds = listingsData.listingsToRemove.map(
      (row: { id: string }) => row.id,
    );
    expect(removalIds).toEqual(
      expect.arrayContaining([
        soldListingId,
        absentListingId,
        staleListingId,
        salesSoldListingId,
      ]),
    );
    expect(removalIds).not.toContain(onSaleListingId);
  });

  it("P2-1: le propriétaire voit toute la concession, le vendeur seulement les siennes", async () => {
    const [ownerDash, salesDash, salesListings] = await Promise.all([
      dashboardHandler(
        makeRequest("http://localhost/api/v1/analytics/dashboard", {
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
        { params: Promise.resolve({}) },
      ),
      dashboardHandler(
        makeRequest("http://localhost/api/v1/analytics/dashboard", {
          headers: { Authorization: `Bearer ${salesToken}` },
        }),
        { params: Promise.resolve({}) },
      ),
      listingsHandler(
        makeRequest("http://localhost/api/v1/listings?limit=250", {
          headers: { Authorization: `Bearer ${salesToken}` },
        }),
        { params: Promise.resolve({}) },
      ),
    ]);

    const ownerData = await ownerDash.json();
    const salesData = await salesDash.json();
    const salesListingData = await salesListings.json();

    expect(ownerDash.status).toBe(200);
    expect(salesDash.status).toBe(200);

    const ownerRemovalIds = ownerData.listingsToRemove.map(
      (row: { id: string }) => row.id,
    );
    expect(ownerRemovalIds).toEqual(
      expect.arrayContaining([soldListingId, salesSoldListingId]),
    );
    expect(ownerData.listingsToRemove).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: salesSoldListingId,
          user: { name: "Vendeur Review" },
        }),
        expect.objectContaining({
          id: soldListingId,
          user: { name: "Owner Review" },
        }),
      ]),
    );

    expect(salesData.listingsToRemove).toHaveLength(1);
    expect(salesData.listingsToRemove[0]).toEqual(
      expect.objectContaining({
        id: salesSoldListingId,
        user: { name: "Vendeur Review" },
      }),
    );
    expect(
      salesListingData.listingsToRemove.map((row: { id: string }) => row.id),
    ).toEqual([salesSoldListingId]);
  });

  it("P2-2: un véhicule non vu depuis 48 h sort de l’inventaire sans changer le statut", async () => {
    const [vehiclesRes, dashboardRes, absenceRes, extensionRes] =
      await Promise.all([
        vehiclesHandler(
          makeRequest("http://localhost/api/v1/vehicles?limit=100", {
            headers: { Authorization: `Bearer ${ownerToken}` },
          }),
          { params: Promise.resolve({}) },
        ),
        dashboardHandler(
          makeRequest("http://localhost/api/v1/analytics/dashboard", {
            headers: { Authorization: `Bearer ${ownerToken}` },
          }),
          { params: Promise.resolve({}) },
        ),
        feedAbsenceHandler(
          makeRequest("http://localhost/api/v1/vehicles/feed-absence", {
            headers: { Authorization: `Bearer ${ownerToken}` },
          }),
          { params: Promise.resolve({}) },
        ),
        extensionInventoryHandler(
          makeRequest("http://localhost/api/v1/extension?limit=50", {
            headers: { "X-API-Key": apiKey },
          }) as never,
        ),
      ]);

    const vehiclesData = await vehiclesRes.json();
    const dashboardData = await dashboardRes.json();
    const absenceData = await absenceRes.json();
    const extensionData = await extensionRes.json();

    expect(vehiclesRes.status).toBe(200);
    const inventoryIds = vehiclesData.vehicles.map(
      (vehicle: { id: string }) => vehicle.id,
    );
    expect(inventoryIds).toEqual(
      expect.arrayContaining([
        onSaleVehicleId,
        manualVehicleId,
        failedSourceVehicleId,
        unseenButSourceLagVehicleId,
      ]),
    );
    expect(inventoryIds).not.toContain(staleVehicleId);
    expect(inventoryIds).not.toContain(soldVehicleId);
    expect(inventoryIds).not.toContain(absentVehicleId);
    expect(vehiclesData.pagination.total).toBe(4);
    expect(dashboardData.totalVehicles).toBe(4);

    const staleRow = absenceData.vehicles.find(
      (vehicle: { id: string }) => vehicle.id === staleVehicleId,
    );
    expect(staleRow).toEqual(
      expect.objectContaining({
        id: staleVehicleId,
        confirmable: false,
        reviewReason: expect.stringMatching(/^non vu depuis \d+ jours?$/),
      }),
    );
    expect(
      absenceData.vehicles.map((vehicle: { id: string }) => vehicle.id),
    ).toEqual(expect.arrayContaining([absentVehicleId, staleVehicleId]));
    expect(dashboardData.pendingFeedReview).toBe(2);

    const extensionIds = extensionData.vehicles.map(
      (vehicle: { id: string }) => vehicle.id,
    );
    expect(extensionIds).not.toContain(staleVehicleId);
    expect(extensionData.pagination.total).toBe(4);

    const persisted = await prisma.vehicle.findUnique({
      where: { id: staleVehicleId },
      select: { status: true, feedAbsenceStatus: true },
    });
    expect(persisted).toEqual({
      status: "AVAILABLE",
      feedAbsenceStatus: "IN_FEED",
    });
  });
});
