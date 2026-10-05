import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@okauto/database";
import bcrypt from "bcryptjs";
import { POST as loginHandler } from "@/app/api/v1/auth/login/route";
import { GET as currentUserHandler } from "@/app/api/v1/auth/me/route";
import { GET as vehiclesHandler } from "@/app/api/v1/vehicles/route";
import { GET as vehicleDetailsHandler } from "@/app/api/v1/vehicles/[id]/route";
import { PUT as updateMarketplaceDraftHandler } from "@/app/api/v1/vehicles/[id]/marketplace-draft/route";
import {
  GET as listingsHandler,
  POST as createListingHandler,
} from "@/app/api/v1/listings/route";
import { PATCH as updateListingHandler } from "@/app/api/v1/listings/[id]/route";
import { GET as dashboardHandler } from "@/app/api/v1/analytics/dashboard/route";
import { GET as healthHandler } from "@/app/api/health/route";
import { GET as extensionInventoryHandler } from "@/app/api/v1/extension/route";
import { GET as extensionVehicleHandler } from "@/app/api/v1/extension/vehicles/[id]/route";
import { POST as extensionEventHandler } from "@/app/api/v1/extension/events/route";
import {
  GET as apiKeysHandler,
  POST as createApiKeyHandler,
} from "@/app/api/v1/admin/api-keys/route";
import { DELETE as revokeApiKeyHandler } from "@/app/api/v1/admin/api-keys/[id]/route";
import { POST as inviteMemberHandler } from "@/app/api/v1/organizations/members/route";
import { PATCH as updateMemberHandler } from "@/app/api/v1/organizations/members/[id]/route";
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

describe("API route handlers", () => {
  let accessToken: string;
  let salespersonAccessToken: string;
  let extensionApiKey: string;
  let extensionApiKeyId: string;
  let salespersonExtensionApiKeyId: string;
  let extensionVehicleId: string;
  let demoVehicleId: string;
  let invitedMemberId: string;
  let dealerOrganizationId: string;
  let existingMemberOrganizationId: string;
  const invitedMemberEmail = `new-salesperson-${Date.now()}@example.com`;
  const existingMemberEmail = `existing-salesperson-${Date.now()}@example.com`;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("Demo1234!", 12);
    const user = await prisma.user.upsert({
      where: { email: "owner@demo.okauto.local" },
      update: { passwordHash, name: "Michael Boyer" },
      create: {
        email: "owner@demo.okauto.local",
        passwordHash,
        name: "Michael Boyer",
      },
    });

    const org = await prisma.organization.upsert({
      where: { slug: "demo-motors" },
      update: {},
      create: { name: "Demo Motors", slug: "demo-motors" },
    });
    dealerOrganizationId = org.id;

    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: { organizationId: org.id, userId: user.id },
      },
      update: { role: "OWNER" },
      create: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });

    extensionApiKey = `okauto_test_extension_${Date.now()}`;
    const apiKey = await prisma.apiKey.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        name: "Extension integration test",
        keyHash: hashToken(extensionApiKey),
        keyPrefix: extensionApiKey.slice(0, 12),
      },
    });
    extensionApiKeyId = apiKey.id;

    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        stockNumber: `TEST-EXT-${Date.now()}`,
        year: 2025,
        make: "GMC",
        model: "Terrain",
        mileage: 24500,
        price: 39995,
        condition: "New",
        sourceUrl:
          "https://www.buckinghamgm.com/occasion/GMC-Terrain-2025.html",
        status: "AVAILABLE",
      },
    });
    extensionVehicleId = vehicle.id;

    const demoVehicle = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        stockNumber: `TEST-DEMO-${Date.now()}`,
        year: 2026,
        make: "Chevrolet",
        model: "Suburban",
        mileage: 10,
        price: 117995,
        condition: "New",
        sourceUrl:
          "https://www.buckinghamgm.com/demonstrateurs/Chevrolet-Suburban-2026.html",
        status: "AVAILABLE",
      },
    });
    demoVehicleId = demoVehicle.id;
  });

  afterAll(async () => {
    await prisma.listingEvent.deleteMany({
      where: { listing: { vehicleId: extensionVehicleId } },
    });
    await prisma.listing.deleteMany({
      where: { vehicleId: extensionVehicleId },
    });
    await prisma.vehicle.deleteMany({
      where: { id: { in: [extensionVehicleId, demoVehicleId] } },
    });
    if (salespersonExtensionApiKeyId) {
      await prisma.apiKey.deleteMany({
        where: { id: salespersonExtensionApiKeyId },
      });
    }
    await prisma.apiKey.deleteMany({ where: { id: extensionApiKeyId } });
    await prisma.organizationMember.deleteMany({
      where: {
        user: { email: { in: [invitedMemberEmail, existingMemberEmail] } },
      },
    });
    if (existingMemberOrganizationId) {
      await prisma.organization.deleteMany({
        where: { id: existingMemberOrganizationId },
      });
    }
    await prisma.user.deleteMany({
      where: { email: { in: [invitedMemberEmail, existingMemberEmail] } },
    });
  });

  it("health endpoint returns ok", async () => {
    const res = await healthHandler();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
  });

  it("login returns access token", async () => {
    const req = makeRequest("http://localhost/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "owner@demo.okauto.local",
        password: "Demo1234!",
      }),
    });
    const res = await loginHandler(req as never);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.accessToken).toBeTruthy();
    accessToken = data.accessToken;
  });

  it("refreshes the current profile from the database", async () => {
    const req = makeRequest("http://localhost/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const res = await currentUserHandler(req, { params: Promise.resolve({}) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.name).toBe("Michael Boyer");
    expect(data.role).toBe("OWNER");
    expect(data.organization.id).toBeTruthy();
  });

  it("saves a Marketplace draft only for the authenticated salesperson", async () => {
    const title = "2025 GMC Terrain — prêt pour la route";
    const description =
      "Voici mon GMC Terrain 2025 disponible dès maintenant. Écrivez-moi sur Messenger ou demandez Michael Boyer directement à la concession pour tous les détails.";
    const response = await updateMarketplaceDraftHandler(
      makeRequest(
        `http://localhost/api/v1/vehicles/${extensionVehicleId}/marketplace-draft`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ title, description, photoOrder: [] }),
        },
      ),
      { params: Promise.resolve({ id: extensionVehicleId }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.draft.title).toBe(title);
    expect(data.draft.description).toBe(description);
    expect(data.draft.generationSource).toBe("manual");

    const ownerDetails = await vehicleDetailsHandler(
      makeRequest(`http://localhost/api/v1/vehicles/${extensionVehicleId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      { params: Promise.resolve({ id: extensionVehicleId }) },
    );
    const ownerVehicle = await ownerDetails.json();
    expect(ownerVehicle.marketplaceDrafts).toHaveLength(1);
    expect(ownerVehicle.marketplaceDrafts[0].title).toBe(title);
  });

  it("lets the owner add a sales team member with a temporary password", async () => {
    const req = makeRequest("http://localhost/api/v1/organizations/members", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        name: "Marie Tremblay",
        email: invitedMemberEmail,
        password: "Ok!Temporary7a",
        role: "SALESPERSON",
      }),
    });
    const res = await inviteMemberHandler(req, { params: Promise.resolve({}) });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.user.name).toBe("Marie Tremblay");
    expect(data.role).toBe("SALESPERSON");
    expect(data.temporaryPasswordCreated).toBe(true);
    invitedMemberId = data.id;
  });

  it("lets an owner reset a team member temporary password", async () => {
    const req = makeRequest(
      `http://localhost/api/v1/organizations/members/${invitedMemberId}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ password: "New!Temporary8b" }),
      },
    );
    const res = await updateMemberHandler(req, {
      params: Promise.resolve({ id: invitedMemberId }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.passwordUpdated).toBe(true);

    const login = await loginHandler(
      makeRequest("http://localhost/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: invitedMemberEmail,
          password: "New!Temporary8b",
        }),
      }) as never,
    );
    expect(login.status).toBe(200);
    const loginData = await login.json();
    salespersonAccessToken = loginData.accessToken;
    expect(salespersonAccessToken).toBeTruthy();
  });

  it("opens the shared dealer inventory for an existing user added to the team", async () => {
    const existingPassword = "Existing!Password9c";
    const legacyUser = await prisma.user.create({
      data: {
        email: existingMemberEmail,
        name: "Jean Vendeur",
        passwordHash: await bcrypt.hash(existingPassword, 12),
      },
    });
    const legacyOrganization = await prisma.organization.create({
      data: {
        name: "Ancienne organisation personnelle",
        slug: `legacy-personal-${Date.now()}`,
      },
    });
    existingMemberOrganizationId = legacyOrganization.id;

    await prisma.organizationMember.create({
      data: {
        organizationId: legacyOrganization.id,
        userId: legacyUser.id,
        role: "OWNER",
        joinedAt: new Date(Date.now() - 86_400_000),
      },
    });

    const invite = await inviteMemberHandler(
      makeRequest("http://localhost/api/v1/organizations/members", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          name: "Jean Vendeur",
          email: existingMemberEmail,
          password: "Unused!Temporary7a",
          role: "SALESPERSON",
        }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(invite.status).toBe(201);

    const login = await loginHandler(
      makeRequest("http://localhost/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: existingMemberEmail,
          password: existingPassword,
        }),
      }) as never,
    );
    const loginData = await login.json();

    expect(login.status).toBe(200);
    expect(loginData.organization.id).toBe(dealerOrganizationId);
    expect(loginData.role).toBe("SALESPERSON");

    const vehicles = await vehiclesHandler(
      makeRequest("http://localhost/api/v1/vehicles", {
        headers: { Authorization: `Bearer ${loginData.accessToken}` },
      }),
      { params: Promise.resolve({}) },
    );
    const vehicleData = await vehicles.json();

    expect(vehicles.status).toBe(200);
    expect(
      vehicleData.vehicles.some(
        (vehicle: { id: string }) => vehicle.id === extensionVehicleId,
      ),
    ).toBe(true);
  });

  it("lists vehicles for authenticated user", async () => {
    const req = makeRequest("http://localhost/api/v1/vehicles", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const res = await vehiclesHandler(req, { params: Promise.resolve({}) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data.vehicles)).toBe(true);
  });

  it("uses the dealer source URL to keep used vehicles out of new inventory", async () => {
    const newReq = makeRequest(
      "http://localhost/api/v1/vehicles?inventoryType=NEW",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const newRes = await vehiclesHandler(newReq, {
      params: Promise.resolve({}),
    });
    const newData = await newRes.json();

    expect(newRes.status).toBe(200);
    expect(
      newData.vehicles.some(
        (vehicle: { id: string }) => vehicle.id === extensionVehicleId,
      ),
    ).toBe(false);
    expect(
      newData.vehicles.some(
        (vehicle: { id: string }) => vehicle.id === demoVehicleId,
      ),
    ).toBe(false);

    const usedReq = makeRequest(
      "http://localhost/api/v1/vehicles?inventoryType=USED",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const usedRes = await vehiclesHandler(usedReq, {
      params: Promise.resolve({}),
    });
    const usedData = await usedRes.json();

    expect(usedRes.status).toBe(200);
    expect(
      usedData.vehicles.some(
        (vehicle: { id: string }) => vehicle.id === extensionVehicleId,
      ),
    ).toBe(true);

    const demoReq = makeRequest(
      "http://localhost/api/v1/vehicles?inventoryType=DEMO",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const demoRes = await vehiclesHandler(demoReq, {
      params: Promise.resolve({}),
    });
    const demoData = await demoRes.json();

    expect(demoRes.status).toBe(200);
    expect(
      demoData.vehicles.some(
        (vehicle: { id: string }) => vehicle.id === demoVehicleId,
      ),
    ).toBe(true);
  });

  it("returns dashboard analytics", async () => {
    const req = makeRequest("http://localhost/api/v1/analytics/dashboard", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const res = await dashboardHandler(req, { params: Promise.resolve({}) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(typeof data.totalVehicles).toBe("number");
    expect(Array.isArray(data.memberStats)).toBe(true);
  });

  it("rejects unauthenticated vehicle requests", async () => {
    const req = makeRequest("http://localhost/api/v1/vehicles");
    const res = await vehiclesHandler(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it("records a published Marketplace URL from the extension idempotently", async () => {
    const request = () =>
      makeRequest("http://localhost/api/v1/extension/events", {
        method: "POST",
        headers: { "X-API-Key": extensionApiKey },
        body: JSON.stringify({
          eventType: "listing_created",
          vehicleId: extensionVehicleId,
          metadata: {
            externalUrl: "https://www.facebook.com/marketplace/item/123456789",
          },
        }),
      });

    const firstResponse = await extensionEventHandler(request() as never);
    const firstData = await firstResponse.json();
    expect(firstResponse.status).toBe(200);
    expect(firstData.success).toBe(true);

    const secondResponse = await extensionEventHandler(request() as never);
    const secondData = await secondResponse.json();
    expect(secondResponse.status).toBe(200);
    expect(secondData.alreadyExists).toBe(true);

    const listing = await prisma.listing.findFirst({
      where: { vehicleId: extensionVehicleId, status: "ACTIVE" },
    });
    expect(listing?.externalUrl).toBe(
      "https://www.facebook.com/marketplace/item/123456789",
    );
    expect(listing?.titleAtListing).toContain("2025 GMC Terrain");
    expect(listing?.descriptionAtListing).toContain("Michael Boyer");
    expect(listing?.photoUrlsAtListing).toEqual([]);
  });

  it("keeps publication history private while sharing the same inventory", async () => {
    const ownerListingsResponse = await listingsHandler(
      makeRequest("http://localhost/api/v1/listings?limit=100", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      { params: Promise.resolve({}) },
    );
    const ownerListingsData = await ownerListingsResponse.json();
    const ownerListing = ownerListingsData.listings.find(
      (listing: { vehicleId: string }) =>
        listing.vehicleId === extensionVehicleId,
    );

    expect(ownerListingsResponse.status).toBe(200);
    expect(ownerListing).toBeTruthy();

    const salespersonListingsBefore = await listingsHandler(
      makeRequest("http://localhost/api/v1/listings?limit=100", {
        headers: {
          Authorization: `Bearer ${salespersonAccessToken}`,
        },
      }),
      { params: Promise.resolve({}) },
    );
    const salespersonListingsBeforeData =
      await salespersonListingsBefore.json();
    expect(
      salespersonListingsBeforeData.listings.some(
        (listing: { vehicleId: string }) =>
          listing.vehicleId === extensionVehicleId,
      ),
    ).toBe(false);

    const readyResponse = await vehiclesHandler(
      makeRequest(
        "http://localhost/api/v1/vehicles?withoutActiveListing=true&limit=100",
        {
          headers: {
            Authorization: `Bearer ${salespersonAccessToken}`,
          },
        },
      ),
      { params: Promise.resolve({}) },
    );
    const readyData = await readyResponse.json();
    expect(
      readyData.vehicles.some(
        (vehicle: { id: string }) => vehicle.id === extensionVehicleId,
      ),
    ).toBe(true);

    const salesperson = await prisma.user.findUniqueOrThrow({
      where: { email: invitedMemberEmail },
    });
    const salespersonDraftTitle = "GMC Terrain 2025 — sélection de Marie";
    const salespersonDraftDescription =
      "Je vous présente ce GMC Terrain 2025 disponible chez nous. Écrivez-moi directement sur Messenger pour obtenir les détails et planifier votre essai routier personnalisé.";
    const salespersonDraftResponse = await updateMarketplaceDraftHandler(
      makeRequest(
        `http://localhost/api/v1/vehicles/${extensionVehicleId}/marketplace-draft`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${salespersonAccessToken}`,
          },
          body: JSON.stringify({
            title: salespersonDraftTitle,
            description: salespersonDraftDescription,
          }),
        },
      ),
      { params: Promise.resolve({ id: extensionVehicleId }) },
    );
    expect(salespersonDraftResponse.status).toBe(200);

    const salespersonDraftDetails = await vehicleDetailsHandler(
      makeRequest(`http://localhost/api/v1/vehicles/${extensionVehicleId}`, {
        headers: {
          Authorization: `Bearer ${salespersonAccessToken}`,
        },
      }),
      { params: Promise.resolve({ id: extensionVehicleId }) },
    );
    const salespersonDraftVehicle = await salespersonDraftDetails.json();
    expect(salespersonDraftVehicle.marketplaceDrafts[0].title).toBe(
      salespersonDraftTitle,
    );

    const ownerDraftDetails = await vehicleDetailsHandler(
      makeRequest(`http://localhost/api/v1/vehicles/${extensionVehicleId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      { params: Promise.resolve({ id: extensionVehicleId }) },
    );
    const ownerDraftVehicle = await ownerDraftDetails.json();
    expect(ownerDraftVehicle.marketplaceDrafts[0].title).toBe(
      "2025 GMC Terrain — prêt pour la route",
    );

    const createApiKeyResponse = await createApiKeyHandler(
      makeRequest("http://localhost/api/v1/admin/api-keys", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${salespersonAccessToken}`,
        },
        body: JSON.stringify({ name: "Chrome — poste du vendeur" }),
      }),
      { params: Promise.resolve({}) },
    );
    const salespersonApiKeyData = await createApiKeyResponse.json();
    expect(createApiKeyResponse.status).toBe(201);
    const salespersonApiKey = salespersonApiKeyData.key as string;
    salespersonExtensionApiKeyId = salespersonApiKeyData.id;

    const extensionDraftResponse = await extensionVehicleHandler(
      makeRequest(
        `http://localhost/api/v1/extension/vehicles/${extensionVehicleId}`,
        { headers: { "X-API-Key": salespersonApiKey } },
      ) as never,
      { params: Promise.resolve({ id: extensionVehicleId }) },
    );
    const extensionDraftData = await extensionDraftResponse.json();
    expect(extensionDraftResponse.status).toBe(200);
    expect(extensionDraftData.vehicle.title).toBe(salespersonDraftTitle);
    expect(extensionDraftData.vehicle.description).toBe(
      salespersonDraftDescription,
    );

    const ownerKeysResponse = await apiKeysHandler(
      makeRequest("http://localhost/api/v1/admin/api-keys", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      { params: Promise.resolve({}) },
    );
    const ownerKeys = await ownerKeysResponse.json();
    expect(
      ownerKeys.some(
        (key: { id: string }) => key.id === salespersonExtensionApiKeyId,
      ),
    ).toBe(false);

    const extensionInventoryBefore = await extensionInventoryHandler(
      makeRequest("http://localhost/api/v1/extension", {
        headers: { "X-API-Key": salespersonApiKey },
      }) as never,
    );
    const extensionInventoryBeforeData = await extensionInventoryBefore.json();
    const extensionVehicleBefore = extensionInventoryBeforeData.vehicles.find(
      (vehicle: { id: string }) => vehicle.id === extensionVehicleId,
    );
    expect(extensionVehicleBefore?.hasActiveListing).toBe(false);

    const unauthorizedExtensionUpdate = await extensionEventHandler(
      makeRequest("http://localhost/api/v1/extension/events", {
        method: "POST",
        headers: { "X-API-Key": salespersonApiKey },
        body: JSON.stringify({
          eventType: "listing_removed",
          vehicleId: extensionVehicleId,
          listingId: ownerListing.id,
        }),
      }) as never,
    );
    expect(unauthorizedExtensionUpdate.status).toBe(404);

    const duplicateTeamResponse = await createListingHandler(
      makeRequest("http://localhost/api/v1/listings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${salespersonAccessToken}`,
        },
        body: JSON.stringify({
          vehicleId: extensionVehicleId,
          platform: "facebook_marketplace",
          externalUrl: "https://www.facebook.com/marketplace/item/987654321",
        }),
      }),
      { params: Promise.resolve({}) },
    );
    const duplicateTeamBody = await duplicateTeamResponse.json();
    expect(duplicateTeamResponse.status).toBe(409);
    expect(duplicateTeamBody.error).toMatch(/Anti-doublon d'équipe/);
    expect(duplicateTeamBody.error).toMatch(/Michael Boyer/);

    const duplicateExtension = await extensionEventHandler(
      makeRequest("http://localhost/api/v1/extension/events", {
        method: "POST",
        headers: { "X-API-Key": salespersonApiKey },
        body: JSON.stringify({
          eventType: "listing_created",
          vehicleId: extensionVehicleId,
          metadata: {
            externalUrl: "https://www.facebook.com/marketplace/item/111222333",
          },
        }),
      }) as never,
    );
    expect(duplicateExtension.status).toBe(409);

    const salespersonVehicle = await prisma.vehicle.create({
      data: {
        organizationId: dealerOrganizationId,
        stockNumber: `TEST-SALES-${Date.now()}`,
        year: 2024,
        make: "Chevrolet",
        model: "Trax",
        mileage: 12000,
        price: 28995,
        condition: "Used",
        sourceUrl: "https://www.buckinghamgm.com/occasion/Chevrolet-Trax-2024.html",
        status: "AVAILABLE",
      },
    });

    const createResponse = await createListingHandler(
      makeRequest("http://localhost/api/v1/listings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${salespersonAccessToken}`,
        },
        body: JSON.stringify({
          vehicleId: salespersonVehicle.id,
          platform: "facebook_marketplace",
          externalUrl: "https://www.facebook.com/marketplace/item/987654321",
        }),
      }),
      { params: Promise.resolve({}) },
    );
    const salespersonListing = await createResponse.json();
    expect(createResponse.status).toBe(201);
    expect(salespersonListing.userId).toBe(salesperson.id);

    const extensionInventoryAfter = await extensionInventoryHandler(
      makeRequest("http://localhost/api/v1/extension", {
        headers: { "X-API-Key": salespersonApiKey },
      }) as never,
    );
    const extensionInventoryAfterData = await extensionInventoryAfter.json();
    const extensionVehicleAfter = extensionInventoryAfterData.vehicles.find(
      (vehicle: { id: string }) => vehicle.id === salespersonVehicle.id,
    );
    expect(extensionVehicleAfter?.hasActiveListing).toBe(true);

    const ownerListingsAfter = await listingsHandler(
      makeRequest("http://localhost/api/v1/listings?limit=100", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      { params: Promise.resolve({}) },
    );
    const ownerListingsAfterData = await ownerListingsAfter.json();
    expect(
      ownerListingsAfterData.listings.some(
        (listing: { id: string }) => listing.id === salespersonListing.id,
      ),
    ).toBe(false);

    const salespersonVehicleDetails = await vehicleDetailsHandler(
      makeRequest(`http://localhost/api/v1/vehicles/${salespersonVehicle.id}`, {
        headers: {
          Authorization: `Bearer ${salespersonAccessToken}`,
        },
      }),
      { params: Promise.resolve({ id: salespersonVehicle.id }) },
    );
    const salespersonVehicleData = await salespersonVehicleDetails.json();
    expect(
      salespersonVehicleData.listings.map(
        (listing: { id: string }) => listing.id,
      ),
    ).toEqual([salespersonListing.id]);

    const unauthorizedUpdate = await updateListingHandler(
      makeRequest(`http://localhost/api/v1/listings/${ownerListing.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${salespersonAccessToken}`,
        },
        body: JSON.stringify({ status: "REMOVED" }),
      }),
      { params: Promise.resolve({ id: ownerListing.id }) },
    );
    expect(unauthorizedUpdate.status).toBe(404);

    const unauthorizedRevoke = await revokeApiKeyHandler(
      makeRequest(
        `http://localhost/api/v1/admin/api-keys/${salespersonExtensionApiKeyId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      ),
      { params: Promise.resolve({ id: salespersonExtensionApiKeyId }) },
    );
    expect(unauthorizedRevoke.status).toBe(404);

    const activeListings = await prisma.listing.findMany({
      where: {
        organizationId: dealerOrganizationId,
        vehicleId: extensionVehicleId,
        status: "ACTIVE",
      },
    });
    expect(new Set(activeListings.map((listing) => listing.userId)).size).toBe(
      1,
    );
  });
});
