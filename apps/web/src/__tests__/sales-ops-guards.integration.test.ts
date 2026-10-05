import { randomBytes } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@okauto/database";
import bcrypt from "bcryptjs";
import { POST as loginHandler } from "@/app/api/v1/auth/login/route";
import { POST as createListingHandler } from "@/app/api/v1/listings/route";
import { POST as createLeadHandler } from "@/app/api/v1/leads/route";
import { GET as metaCatalogFeedHandler } from "@/app/api/feeds/meta/[token]/vehicles.csv/route";

function makeRequest(url: string, options: RequestInit = {}): Request {
  return new Request(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });
}

describe("sales-ops server guards", () => {
  const stamp = Date.now();
  const ownerEmail = `guards-owner-${stamp}@example.com`;
  const salesEmail = `guards-sales-${stamp}@example.com`;
  const outsiderEmail = `guards-out-${stamp}@example.com`;
  let orgId: string;
  let ownerToken: string;
  let salesToken: string;
  let vehicleA: string;
  let vehicleB: string;
  let vehicleC: string;
  let feedToken: string;
  let salesUserId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("Demo1234!", 12);
    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        passwordHash,
        name: "Directeur Guards",
      },
    });
    const sales = await prisma.user.create({
      data: {
        email: salesEmail,
        passwordHash,
        name: "Vendeur Guards",
      },
    });
    salesUserId = sales.id;
    await prisma.user.create({
      data: {
        email: outsiderEmail,
        passwordHash,
        name: "Hors Org",
      },
    });

    feedToken = randomBytes(24).toString("base64url");
    const org = await prisma.organization.create({
      data: {
        name: "Guards Motors",
        slug: `guards-motors-${stamp}`,
        address: "555 boul. Maloney",
        city: "Gatineau",
        state: "QC",
        zip: "J8P1H0",
        phone: "8195550100",
        website: "https://www.buckinghamgm.com",
        freightFee: 1000,
        pdiFee: 500,
        adminFee: 399,
        acExciseFee: 100,
        marketplaceMonthlyVehicleLimit: 1,
        monthlyListingLimit: 1,
        metaCatalogFeedEnabled: true,
        metaCatalogFeedToken: feedToken,
      },
    });
    orgId = org.id;

    await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    await prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: sales.id,
        role: "SALESPERSON",
      },
    });

    const [a, b, c] = await Promise.all([
      prisma.vehicle.create({
        data: {
          organizationId: org.id,
          stockNumber: `G-A-${stamp}`,
          vin: `1G1AAAAAAAAAAAAAA`,
          year: 2024,
          make: "GMC",
          model: "Terrain",
          mileage: 12000,
          price: 20000,
          exteriorColor: "Blanc",
          condition: "Used",
          sourceUrl: "https://www.buckinghamgm.com/occasion/terrain.html",
          status: "AVAILABLE",
          photos: {
            create: {
              url: "https://cdn.example.com/terrain.jpg",
              sortOrder: 0,
              isPrimary: true,
            },
          },
        },
      }),
      prisma.vehicle.create({
        data: {
          organizationId: org.id,
          stockNumber: `G-B-${stamp}`,
          year: 2023,
          make: "Chevrolet",
          model: "Trax",
          mileage: 8000,
          price: 18995,
          condition: "Used",
          sourceUrl: "https://www.buckinghamgm.com/occasion/trax.html",
          status: "AVAILABLE",
        },
      }),
      prisma.vehicle.create({
        data: {
          organizationId: org.id,
          stockNumber: `G-C-${stamp}`,
          year: 2022,
          make: "Buick",
          model: "Encore",
          mileage: 22000,
          price: 21995,
          condition: "Used",
          sourceUrl: "https://www.buckinghamgm.com/occasion/encore.html",
          status: "AVAILABLE",
        },
      }),
    ]);
    vehicleA = a.id;
    vehicleB = b.id;
    vehicleC = c.id;

    const ownerLogin = await loginHandler(
      makeRequest("http://localhost/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: ownerEmail, password: "Demo1234!" }),
      }) as never,
    );
    const salesLogin = await loginHandler(
      makeRequest("http://localhost/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: salesEmail, password: "Demo1234!" }),
      }) as never,
    );
    ownerToken = (await ownerLogin.json()).accessToken;
    salesToken = (await salesLogin.json()).accessToken;
    if (!ownerToken || !salesToken) {
      throw new Error("Login failed for sales-ops guard fixtures");
    }
  });

  afterAll(async () => {
    if (orgId) {
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    }
    await prisma.user
      .deleteMany({
        where: { email: { in: [ownerEmail, salesEmail, outsiderEmail] } },
      })
      .catch(() => undefined);
  });

  it("rejects a teammate ACTIVE listing for the same vehicle+platform", async () => {
    const ownerCreate = await createListingHandler(
      makeRequest("http://localhost/api/v1/listings", {
        method: "POST",
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({
          vehicleId: vehicleA,
          platform: "facebook_marketplace",
          externalUrl: "https://www.facebook.com/marketplace/item/100000001",
        }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(ownerCreate.status).toBe(201);

    const salesCreate = await createListingHandler(
      makeRequest("http://localhost/api/v1/listings", {
        method: "POST",
        headers: { Authorization: `Bearer ${salesToken}` },
        body: JSON.stringify({
          vehicleId: vehicleA,
          platform: "facebook_marketplace",
          externalUrl: "https://www.facebook.com/marketplace/item/100000002",
        }),
      }),
      { params: Promise.resolve({}) },
    );
    const body = await salesCreate.json();
    expect(salesCreate.status).toBe(409);
    expect(body.error).toMatch(/Anti-doublon d'équipe/);
    expect(body.error).toMatch(/Directeur Guards/);
  });

  it("enforces the monthly quota with member override > org setting", async () => {
    const first = await createListingHandler(
      makeRequest("http://localhost/api/v1/listings", {
        method: "POST",
        headers: { Authorization: `Bearer ${salesToken}` },
        body: JSON.stringify({
          vehicleId: vehicleB,
          platform: "facebook_marketplace",
          externalUrl: "https://www.facebook.com/marketplace/item/200000001",
        }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(first.status).toBe(201);

    const blocked = await createListingHandler(
      makeRequest("http://localhost/api/v1/listings", {
        method: "POST",
        headers: { Authorization: `Bearer ${salesToken}` },
        body: JSON.stringify({
          vehicleId: vehicleC,
          platform: "facebook_marketplace",
          externalUrl: "https://www.facebook.com/marketplace/item/200000002",
        }),
      }),
      { params: Promise.resolve({}) },
    );
    const blockedBody = await blocked.json();
    expect(blocked.status).toBe(409);
    expect(blockedBody.error).toMatch(/Quota mensuel atteint/);

    await prisma.organizationMember.updateMany({
      where: { organizationId: orgId, userId: salesUserId },
      data: { marketplaceMonthlyVehicleLimit: 2 },
    });

    const allowed = await createListingHandler(
      makeRequest("http://localhost/api/v1/listings", {
        method: "POST",
        headers: { Authorization: `Bearer ${salesToken}` },
        body: JSON.stringify({
          vehicleId: vehicleC,
          platform: "facebook_marketplace",
          externalUrl: "https://www.facebook.com/marketplace/item/200000003",
        }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(allowed.status).toBe(201);
  });

  it("exports the Québec advertised price on the tokenized Meta CSV and disables caching", async () => {
    const response = await metaCatalogFeedHandler(
      makeRequest(`http://localhost/api/feeds/meta/${feedToken}/vehicles.csv`),
      { params: Promise.resolve({ token: feedToken }) },
    );
    const csv = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(csv).toContain("21999 CAD");
    expect(csv).not.toMatch(/(^|,)20000 CAD(,|$)/m);
  });

  it("rejects a lead assigned to a user outside the organization", async () => {
    const outsider = await prisma.user.findUniqueOrThrow({
      where: { email: outsiderEmail },
    });
    const response = await createLeadHandler(
      makeRequest("http://localhost/api/v1/leads", {
        method: "POST",
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({
          name: "Client test",
          phone: "8195550199",
          assignedToId: outsider.id,
        }),
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/membre de cette organisation/);
  });
});
