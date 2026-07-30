import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BuiltServer } from "../server.js";
import {
  authHeaders,
  buildTestServer,
  createVehicleDirect,
  registerOrg,
  resetDb,
  testPrisma,
} from "./helpers.js";
import { NotificationHub } from "../modules/notifications/hub.js";

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

describe("descriptions", () => {
  it("generates a compliant description and persists it", async () => {
    const account = await registerOrg(server.app, { email: "d@test.dev", orgName: "D Motors" });
    const vehicle = await createVehicleDirect(testPrisma(), account.orgId, { year: 2021, mileage: 42310 });

    const res = await server.app.inject({
      method: "POST",
      url: `/api/v1/vehicles/${vehicle.id}/description:generate`,
      headers: authHeaders(account),
      payload: { tone: "professional" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { text: string; provider: string; removedPhrases: string[] };
    expect(body.provider).toBe("template");
    expect(body.text).toContain("2021 Toyota Camry");
    expect(body.text).toContain("Mileage: 42,310 mi");
    expect(body.text.toLowerCase()).toContain("licensed dealer");

    const updated = await testPrisma().vehicle.findUnique({ where: { id: vehicle.id } });
    expect(updated?.description).toBe(body.text);
  });

  it("template CRUD keeps exactly one default per org", async () => {
    const account = await registerOrg(server.app, { email: "d2@test.dev", orgName: "D2 Motors" });
    const created = await server.app.inject({
      method: "POST",
      url: "/api/v1/description-templates",
      headers: authHeaders(account),
      payload: { name: "Short", body: "{{year}} {{make}} {{model}}", isDefault: true },
    });
    expect(created.statusCode).toBe(201);
    const templateId = (created.json() as { template: { id: string } }).template.id;

    const prisma = testPrisma();
    const defaults = await prisma.descriptionTemplate.findMany({ where: { orgId: account.orgId, isDefault: true } });
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.id).toBe(templateId);
  });
});

describe("notifications", () => {
  it("lists unread, marks read, and read-all", async () => {
    const account = await registerOrg(server.app, { email: "n@test.dev", orgName: "N Motors" });
    const prisma = testPrisma();
    await prisma.notification.createMany({
      data: [1, 2, 3].map((i) => ({
        orgId: account.orgId,
        userId: account.userId,
        type: "SYNC_HEALTH" as const,
        title: `Note ${i}`,
        body: "body",
      })),
    });

    const list = await server.app.inject({
      method: "GET",
      url: "/api/v1/notifications?unreadOnly=true",
      headers: authHeaders(account),
    });
    const body = list.json() as { items: { id: string }[]; unreadCount: number };
    expect(body.items).toHaveLength(3);
    expect(body.unreadCount).toBe(3);

    const read = await server.app.inject({
      method: "POST",
      url: `/api/v1/notifications/${body.items[0]!.id}/read`,
      headers: authHeaders(account),
    });
    expect(read.statusCode).toBe(200);

    const readAll = await server.app.inject({
      method: "POST",
      url: "/api/v1/notifications/read-all",
      headers: authHeaders(account),
    });
    expect((readAll.json() as { updated: number }).updated).toBe(2);

    const after = await server.app.inject({
      method: "GET",
      url: "/api/v1/notifications",
      headers: authHeaders(account),
    });
    expect((after.json() as { unreadCount: number }).unreadCount).toBe(0);
  });

  it("hub publishes only to matching org+user clients", () => {
    const hub = new NotificationHub();
    const received: unknown[] = [];
    const remove = hub.add({ orgId: "org-1", userId: "user-1", send: (_e, d) => received.push(d) });
    hub.publish({
      id: "1", orgId: "org-1", userId: "user-1", type: "LISTING_LIVE", title: "t", body: "b",
      data: null, readAt: null, createdAt: new Date(),
    });
    hub.publish({
      id: "2", orgId: "org-2", userId: "user-1", type: "LISTING_LIVE", title: "t", body: "b",
      data: null, readAt: null, createdAt: new Date(),
    });
    hub.publish({
      id: "3", orgId: "org-1", userId: "user-2", type: "LISTING_LIVE", title: "t", body: "b",
      data: null, readAt: null, createdAt: new Date(),
    });
    expect(received).toHaveLength(1);
    remove();
  });
});

describe("analytics", () => {
  it("overview aggregates vehicle and listing counts", async () => {
    const account = await registerOrg(server.app, { email: "an@test.dev", orgName: "AN Motors" });
    const prisma = testPrisma();
    await createVehicleDirect(prisma, account.orgId, {});
    await createVehicleDirect(prisma, account.orgId, { status: "SOLD" });
    await prisma.listing.create({
      data: {
        orgId: account.orgId,
        vehicleId: (await prisma.vehicle.findFirstOrThrow({ where: { orgId: account.orgId, status: "ACTIVE" } })).id,
        status: "LIVE",
        title: "T",
        assigneeId: account.userId,
      },
    });

    const res = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview",
      headers: authHeaders(account),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { vehiclesByStatus: Record<string, number>; listingsByStatus: Record<string, number> };
    expect(body.vehiclesByStatus.ACTIVE).toBe(1);
    expect(body.vehiclesByStatus.SOLD).toBe(1);
    expect(body.listingsByStatus.LIVE).toBe(1);
  });

  it("salespeople report groups events per member per day", async () => {
    const account = await registerOrg(server.app, { email: "an2@test.dev", orgName: "AN2 Motors" });
    const prisma = testPrisma();
    const vehicle = await createVehicleDirect(prisma, account.orgId, {});
    const listing = await prisma.listing.create({
      data: { orgId: account.orgId, vehicleId: vehicle.id, status: "LIVE", title: "T", assigneeId: account.userId },
    });
    await prisma.listingEvent.create({
      data: { listingId: listing.id, actorType: "USER", actorUserId: account.userId, fromStatus: "IN_PROGRESS", toStatus: "LIVE" },
    });

    const res = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/salespeople?days=7",
      headers: authHeaders(account),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      salespeople: { userId: string; series: { day: string; toStatus: string; count: number }[] }[];
    };
    const me = body.salespeople.find((s) => s.userId === account.userId);
    expect(me).toBeDefined();
    expect(me!.series.some((s) => s.toStatus === "LIVE" && s.count === 1)).toBe(true);
  });
});

describe("extension tokens", () => {
  it("issues PAT usable for ping + queue, and revokes it", async () => {
    const account = await registerOrg(server.app, { email: "e@test.dev", orgName: "E Motors" });
    const created = await server.app.inject({
      method: "POST",
      url: "/api/v1/extension/tokens",
      headers: authHeaders(account),
      payload: { label: "My Chrome" },
    });
    expect(created.statusCode).toBe(201);
    const { plaintext, token } = created.json() as { plaintext: string; token: { id: string; prefix: string } };
    expect(plaintext.startsWith("oka_ext_")).toBe(true);
    expect(token.prefix).toBe(plaintext.slice(0, 16));

    // PAT authenticates without x-org-id (bound to token org).
    const ping = await server.app.inject({
      method: "GET",
      url: "/api/v1/extension/ping",
      headers: { authorization: `Bearer ${plaintext}` },
    });
    expect(ping.statusCode).toBe(200);
    const pingBody = ping.json() as { viaExtensionToken: boolean; org: { id: string } };
    expect(pingBody.viaExtensionToken).toBe(true);
    expect(pingBody.org.id).toBe(account.orgId);

    // Revoke → ping fails.
    await server.app.inject({
      method: "DELETE",
      url: `/api/v1/extension/tokens/${token.id}`,
      headers: authHeaders(account),
    });
    const after = await server.app.inject({
      method: "GET",
      url: "/api/v1/extension/ping",
      headers: { authorization: `Bearer ${plaintext}` },
    });
    expect(after.statusCode).toBe(401);
  });
});

describe("system endpoints", () => {
  it("health, readiness and metrics respond", async () => {
    const health = await server.app.inject({ method: "GET", url: "/healthz" });
    expect(health.statusCode).toBe(200);
    const ready = await server.app.inject({ method: "GET", url: "/readyz" });
    expect(ready.statusCode).toBe(200);
    const metrics = await server.app.inject({ method: "GET", url: "/metrics" });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers["content-type"]).toContain("text/plain");
  });
});
