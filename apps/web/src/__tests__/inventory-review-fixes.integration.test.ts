import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@okauto/database";
import { POST as loginHandler } from "@/app/api/v1/auth/login/route";
import { GET as listingsHandler } from "@/app/api/v1/listings/route";
import { GET as dashboardHandler } from "@/app/api/v1/analytics/dashboard/route";
import { GET as publishQueueHandler } from "@/app/api/v1/analytics/publish-queue/route";
import { GET as directorHandler } from "@/app/api/v1/analytics/director/route";
import { GET as vehiclesHandler } from "@/app/api/v1/vehicles/route";
import {
  GET as feedAbsenceHandler,
  POST as feedAbsencePostHandler,
} from "@/app/api/v1/vehicles/feed-absence/route";
import { GET as extensionInventoryHandler } from "@/app/api/v1/extension/route";
import { GET as extensionVehicleHandler } from "@/app/api/v1/extension/vehicles/[id]/route";
import { GET as extensionPhotosHandler } from "@/app/api/v1/extension/photos/[vehicleId]/route";
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
  let alreadyKeptStaleVehicleId: string;
  let onSalePhotoId: string;

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
      alreadyKeptStale,
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
      prisma.vehicle.create({
        data: {
          organizationId: org.id,
          stockNumber: `RV-KEPT-${stamp}`,
          year: 2015,
          make: "Subaru",
          model: "Outback",
          status: "AVAILABLE",
          feedAbsenceStatus: "KEPT",
          lastSeenAt: lastSeenStale,
          syncSourceId: onSaleSource.id,
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
    alreadyKeptStaleVehicleId = alreadyKeptStale.id;

    const photo = await prisma.vehiclePhoto.create({
      data: {
        vehicleId: onSaleVehicle.id,
        url: `https://example.com/review-onsale-${stamp}.jpg`,
        sortOrder: 0,
        isPrimary: true,
      },
    });
    onSalePhotoId = photo.id;

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
    await prisma.vehiclePhoto.deleteMany({ where: { id: onSalePhotoId } });
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
            alreadyKeptStaleVehicleId,
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
        alreadyKeptStaleVehicleId,
      ]),
    );
    expect(inventoryIds).not.toContain(staleVehicleId);
    expect(inventoryIds).not.toContain(soldVehicleId);
    expect(inventoryIds).not.toContain(absentVehicleId);
    expect(vehiclesData.pagination.total).toBe(5);
    expect(dashboardData.totalVehicles).toBe(5);

    const staleRow = absenceData.vehicles.find(
      (vehicle: { id: string }) => vehicle.id === staleVehicleId,
    );
    expect(staleRow).toEqual(
      expect.objectContaining({
        id: staleVehicleId,
        confirmable: false,
        keepable: true,
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
    expect(extensionIds).toContain(alreadyKeptStaleVehicleId);
    expect(extensionData.pagination.total).toBe(5);

    const persisted = await prisma.vehicle.findUnique({
      where: { id: staleVehicleId },
      select: { status: true, feedAbsenceStatus: true },
    });
    expect(persisted).toEqual({
      status: "AVAILABLE",
      feedAbsenceStatus: "IN_FEED",
    });
  });

  it("P1-A: la fiche et les photos visent le véhicule demandé malgré un périmé", async () => {
    const missingId = `missing-${stamp}`;
    const headers = { "X-API-Key": apiKey };

    const onSaleDetail = await extensionVehicleHandler(
      makeRequest(
        `http://localhost/api/v1/extension/vehicles/${onSaleVehicleId}`,
        { headers },
      ) as never,
      { params: Promise.resolve({ id: onSaleVehicleId }) },
    );
    const onSaleData = await onSaleDetail.json();
    expect(onSaleDetail.status).toBe(200);
    expect(onSaleData.vehicle.id).toBe(onSaleVehicleId);

    for (const id of [staleVehicleId, soldVehicleId, missingId]) {
      const detail = await extensionVehicleHandler(
        makeRequest(`http://localhost/api/v1/extension/vehicles/${id}`, {
          headers,
        }) as never,
        { params: Promise.resolve({ id }) },
      );
      expect(detail.status).toBe(404);
    }

    const onSalePhotos = await extensionPhotosHandler(
      makeRequest(
        `http://localhost/api/v1/extension/photos/${onSaleVehicleId}`,
        { headers },
      ) as never,
      { params: Promise.resolve({ vehicleId: onSaleVehicleId }) },
    );
    const onSalePhotoBody = await onSalePhotos.json();
    expect(onSalePhotos.status).not.toBe(404);
    expect(onSalePhotoBody.error).not.toBe("Vehicle not found");

    const noPhoto = await extensionPhotosHandler(
      makeRequest(
        `http://localhost/api/v1/extension/photos/${manualVehicleId}`,
        { headers },
      ) as never,
      { params: Promise.resolve({ vehicleId: manualVehicleId }) },
    );
    const noPhotoBody = await noPhoto.json();
    expect(noPhoto.status).toBe(404);
    expect(noPhotoBody.error).toBe("Photo not found");

    for (const id of [staleVehicleId, soldVehicleId, missingId]) {
      const photos = await extensionPhotosHandler(
        makeRequest(`http://localhost/api/v1/extension/photos/${id}`, {
          headers,
        }) as never,
        { params: Promise.resolve({ vehicleId: id }) },
      );
      const body = await photos.json();
      expect(photos.status).toBe(404);
      expect(body.error).toBe("Vehicle not found");
    }
  });

  it("P2-A: garder un périmé le remet en inventaire et il y reste", async () => {
    const before = await prisma.vehicle.findUnique({
      where: { id: staleVehicleId },
      select: { lastSeenAt: true, feedAbsenceStatus: true },
    });
    expect(before?.feedAbsenceStatus).toBe("IN_FEED");

    const keep = await feedAbsencePostHandler(
      makeRequest("http://localhost/api/v1/vehicles/feed-absence", {
        method: "POST",
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({
          vehicleIds: [staleVehicleId],
          action: "keep",
        }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(keep.status).toBe(200);
    expect(await keep.json()).toEqual({ updated: 1 });

    const afterKeep = await prisma.vehicle.findUnique({
      where: { id: staleVehicleId },
      select: { lastSeenAt: true, feedAbsenceStatus: true, status: true },
    });
    expect(afterKeep?.status).toBe("AVAILABLE");
    expect(afterKeep?.feedAbsenceStatus).toBe("KEPT");
    expect(afterKeep?.lastSeenAt?.toISOString()).toBe(
      before?.lastSeenAt?.toISOString(),
    );

    const [vehiclesRes, extensionRes, absenceRes] = await Promise.all([
      vehiclesHandler(
        makeRequest("http://localhost/api/v1/vehicles?limit=100", {
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
        { params: Promise.resolve({}) },
      ),
      extensionInventoryHandler(
        makeRequest("http://localhost/api/v1/extension?limit=50", {
          headers: { "X-API-Key": apiKey },
        }) as never,
      ),
      feedAbsenceHandler(
        makeRequest("http://localhost/api/v1/vehicles/feed-absence", {
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
        { params: Promise.resolve({}) },
      ),
    ]);
    const vehiclesData = await vehiclesRes.json();
    const extensionData = await extensionRes.json();
    const absenceData = await absenceRes.json();
    const inventoryIds = vehiclesData.vehicles.map(
      (vehicle: { id: string }) => vehicle.id,
    );
    const extensionIds = extensionData.vehicles.map(
      (vehicle: { id: string }) => vehicle.id,
    );

    expect(inventoryIds).toContain(staleVehicleId);
    expect(extensionIds).toContain(staleVehicleId);
    expect(vehiclesData.pagination.total).toBe(6);
    expect(extensionData.pagination.total).toBe(6);
    expect(
      absenceData.vehicles.map((vehicle: { id: string }) => vehicle.id),
    ).not.toContain(staleVehicleId);

    const stillThere = await vehiclesHandler(
      makeRequest("http://localhost/api/v1/vehicles?limit=100", {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      { params: Promise.resolve({}) },
    );
    const stillData = await stillThere.json();
    expect(stillData.vehicles.map((vehicle: { id: string }) => vehicle.id)).toContain(
      staleVehicleId,
    );
  });
});
