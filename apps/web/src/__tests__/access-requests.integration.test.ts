import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@okauto/database";
import bcrypt from "bcryptjs";
import {
  GET as listAccessRequests,
  POST as createAccessRequest,
} from "@/app/api/v1/access-requests/route";
import { POST as loginHandler } from "@/app/api/v1/auth/login/route";
import {
  ACCESS_REQUEST_RATE_LIMIT,
  MemoryRateLimitStore,
  setAuthRateLimitStoreForTests,
} from "@/lib/rate-limit";

function makeRequest(
  url: string,
  options: RequestInit = {},
  ip = "203.0.113.40",
): Request {
  return new Request(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
      ...(options.headers as Record<string, string>),
    },
  });
}

const validBody = {
  name: "Camille Rivard",
  dealership: "Rivard Auto",
  email: `access-${Date.now()}@example.com`,
  phone: "514-555-0199",
  message: "Nous voulons publier notre inventaire sur Marketplace.",
  consent: true,
};

describe("demandes d’accès", () => {
  const previousTrustProxy = process.env.TRUST_PROXY;
  let ownerToken: string;
  let salesToken: string;
  let createdId: string | undefined;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    process.env.TRUST_PROXY = "true";
    setAuthRateLimitStoreForTests(new MemoryRateLimitStore());

    const passwordHash = await bcrypt.hash("Demo1234!", 12);
    const owner = await prisma.user.upsert({
      where: { email: "owner@demo.okauto.local" },
      update: { passwordHash, name: "Michael Boyer" },
      create: {
        email: "owner@demo.okauto.local",
        passwordHash,
        name: "Michael Boyer",
      },
    });
    const sales = await prisma.user.upsert({
      where: { email: "sales@demo.okauto.local" },
      update: { passwordHash },
      create: {
        email: "sales@demo.okauto.local",
        passwordHash,
        name: "Équipe Marketplace",
      },
    });
    const org = await prisma.organization.upsert({
      where: { slug: "demo-motors" },
      update: {},
      create: { name: "Demo Motors", slug: "demo-motors" },
    });
    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: { organizationId: org.id, userId: owner.id },
      },
      update: { role: "OWNER" },
      create: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: { organizationId: org.id, userId: sales.id },
      },
      update: { role: "SALESPERSON" },
      create: {
        organizationId: org.id,
        userId: sales.id,
        role: "SALESPERSON",
      },
    });

    const ownerLogin = await loginHandler(
      makeRequest("http://localhost/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "owner@demo.okauto.local",
          password: "Demo1234!",
        }),
      }) as never,
    );
    ownerToken = (await ownerLogin.json()).accessToken;
    const salesLogin = await loginHandler(
      makeRequest("http://localhost/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "sales@demo.okauto.local",
          password: "Demo1234!",
        }),
      }) as never,
    );
    salesToken = (await salesLogin.json()).accessToken;
  });

  afterAll(async () => {
    if (previousTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previousTrustProxy;
    setAuthRateLimitStoreForTests(new MemoryRateLimitStore());
    if (createdEmails.length > 0) {
      await prisma.accessRequest.deleteMany({
        where: { email: { in: createdEmails } },
      });
    }
  });

  it("enregistre une demande sans créer de compte", async () => {
    const usersBefore = await prisma.user.count();
    const email = `access-ok-${Date.now()}@example.com`;
    createdEmails.push(email);

    const res = await createAccessRequest(
      makeRequest("http://localhost/api/v1/access-requests", {
        method: "POST",
        body: JSON.stringify({ ...validBody, email }),
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.id).toBeTruthy();
    createdId = data.id;

    const stored = await prisma.accessRequest.findUnique({
      where: { id: data.id },
    });
    expect(stored?.email).toBe(email);
    expect(stored?.dealership).toBe(validBody.dealership);
    expect(stored?.consentAt).toBeInstanceOf(Date);
    expect(stored?.ipAddress).toBe("203.0.113.40");
    expect(await prisma.user.count()).toBe(usersBefore);
    expect(
      await prisma.user.findUnique({ where: { email } }),
    ).toBeNull();
  });

  it("refuse une demande sans consentement", async () => {
    const res = await createAccessRequest(
      makeRequest(
        "http://localhost/api/v1/access-requests",
        {
          method: "POST",
          body: JSON.stringify({
            ...validBody,
            email: `access-noconsent-${Date.now()}@example.com`,
            consent: false,
          }),
        },
        "198.51.100.10",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("exige une authentification propriétaire pour lister", async () => {
    const anonymous = await listAccessRequests(
      makeRequest("http://localhost/api/v1/access-requests"),
      { params: Promise.resolve({}) },
    );
    expect(anonymous.status).toBe(401);

    const salesperson = await listAccessRequests(
      makeRequest("http://localhost/api/v1/access-requests", {
        headers: { Authorization: `Bearer ${salesToken}` },
      }),
      { params: Promise.resolve({}) },
    );
    expect(salesperson.status).toBe(403);

    const owner = await listAccessRequests(
      makeRequest("http://localhost/api/v1/access-requests", {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      { params: Promise.resolve({}) },
    );
    const data = await owner.json();
    expect(owner.status).toBe(200);
    expect(Array.isArray(data.requests)).toBe(true);
    const row = data.requests.find(
      (item: { id: string }) => item.id === createdId,
    );
    expect(row?.name).toBe(validBody.name);
    expect(row?.ipAddress).toBeUndefined();
  });

  it("limite le débit par adresse IP", async () => {
    setAuthRateLimitStoreForTests(new MemoryRateLimitStore());
    const ip = "203.0.113.91";

    for (let i = 0; i < ACCESS_REQUEST_RATE_LIMIT.maxPerIp; i += 1) {
      const email = `access-rl-${Date.now()}-${i}@example.com`;
      createdEmails.push(email);
      const res = await createAccessRequest(
        makeRequest(
          "http://localhost/api/v1/access-requests",
          {
            method: "POST",
            body: JSON.stringify({ ...validBody, email }),
          },
          ip,
        ),
      );
      expect(res.status).toBe(201);
    }

    const blocked = await createAccessRequest(
      makeRequest(
        "http://localhost/api/v1/access-requests",
        {
          method: "POST",
          body: JSON.stringify({
            ...validBody,
            email: `access-rl-block-${Date.now()}@example.com`,
          }),
        },
        ip,
      ),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });
});
