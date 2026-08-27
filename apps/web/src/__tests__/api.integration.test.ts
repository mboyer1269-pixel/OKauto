import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@okauto/database";
import bcrypt from "bcryptjs";
import { POST as loginHandler } from "@/app/api/v1/auth/login/route";
import { GET as currentUserHandler } from "@/app/api/v1/auth/me/route";
import { GET as vehiclesHandler } from "@/app/api/v1/vehicles/route";
import { GET as dashboardHandler } from "@/app/api/v1/analytics/dashboard/route";
import { GET as healthHandler } from "@/app/api/health/route";
import { POST as extensionEventHandler } from "@/app/api/v1/extension/events/route";
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
  let extensionApiKey: string;
  let extensionApiKeyId: string;
  let extensionVehicleId: string;
  let invitedMemberId: string;
  const invitedMemberEmail = `new-salesperson-${Date.now()}@example.com`;

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
        price: 39995,
        status: "AVAILABLE",
      },
    });
    extensionVehicleId = vehicle.id;
  });

  afterAll(async () => {
    await prisma.listingEvent.deleteMany({
      where: { listing: { vehicleId: extensionVehicleId } },
    });
    await prisma.listing.deleteMany({
      where: { vehicleId: extensionVehicleId },
    });
    await prisma.vehicle.deleteMany({ where: { id: extensionVehicleId } });
    await prisma.apiKey.deleteMany({ where: { id: extensionApiKeyId } });
    await prisma.organizationMember.deleteMany({
      where: { user: { email: invitedMemberEmail } },
    });
    await prisma.user.deleteMany({ where: { email: invitedMemberEmail } });
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
  });
});
