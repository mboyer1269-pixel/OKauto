import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BuiltServer } from "../server.js";
import {
  addMember,
  authHeaders,
  buildTestServer,
  createVehicleDirect,
  loginAs,
  registerOrg,
  resetDb,
  testPrisma,
} from "./helpers.js";

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

async function createListingViaApi(account: { accessToken: string; orgId: string }, vehicleId: string) {
  const res = await server.app.inject({
    method: "POST",
    url: "/api/v1/listings",
    headers: authHeaders(account as never),
    payload: { vehicleId, channel: "MARKETPLACE" },
  });
  return res;
}

describe("listings lifecycle", () => {
  it("creates a DRAFT listing with generated title/description and blocks duplicates", async () => {
    const account = await registerOrg(server.app, { email: "l@test.dev", orgName: "L Motors" });
    const vehicle = await createVehicleDirect(testPrisma(), account.orgId, { year: 2021, make: "Toyota", model: "Camry" });

    const res = await createListingViaApi(account, vehicle.id);
    expect(res.statusCode).toBe(201);
    const { listing } = res.json() as { listing: { id: string; status: string; title: string; description: string } };
    expect(listing.status).toBe("DRAFT");
    expect(listing.title).toBe("2021 Toyota Camry");
    expect(listing.description).toContain("2021 Toyota Camry");

    const dup = await createListingViaApi(account, vehicle.id);
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("CONFLICT");
  });

  it("rejects listings for sold vehicles", async () => {
    const account = await registerOrg(server.app, { email: "l2@test.dev", orgName: "L2 Motors" });
    const vehicle = await createVehicleDirect(testPrisma(), account.orgId, { status: "SOLD" });
    const res = await createListingViaApi(account, vehicle.id);
    expect(res.statusCode).toBe(400);
  });

  it("walks the happy path with events + audit, and rejects invalid jumps", async () => {
    const account = await registerOrg(server.app, { email: "l3@test.dev", orgName: "L3 Motors" });
    const prisma = testPrisma();
    const vehicle = await createVehicleDirect(prisma, account.orgId, {});
    const { listing } = (await createListingViaApi(account, vehicle.id)).json() as { listing: { id: string } };

    const invalid = await server.app.inject({
      method: "POST",
      url: `/api/v1/listings/${listing.id}/transition`,
      headers: authHeaders(account),
      payload: { to: "LIVE" },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().error.code).toBe("INVALID_TRANSITION");

    for (const to of ["READY", "QUEUED", "IN_PROGRESS"] as const) {
      const res = await server.app.inject({
        method: "POST",
        url: `/api/v1/listings/${listing.id}/transition`,
        headers: authHeaders(account),
        payload: { to },
      });
      expect(res.statusCode).toBe(200);
    }
    const live = await server.app.inject({
      method: "POST",
      url: `/api/v1/listings/${listing.id}/transition`,
      headers: authHeaders(account),
      payload: { to: "LIVE", externalUrl: "https://www.facebook.com/marketplace/item/42" },
    });
    expect(live.statusCode).toBe(200);
    const body = live.json() as { listing: { status: string; externalUrl: string; postedAt: string } };
    expect(body.listing.status).toBe("LIVE");
    expect(body.listing.externalUrl).toContain("facebook.com");
    expect(body.listing.postedAt).not.toBeNull();

    const events = await prisma.listingEvent.findMany({ where: { listingId: listing.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.toStatus)).toEqual(["DRAFT", "READY", "QUEUED", "IN_PROGRESS", "LIVE"]);

    const audit = await prisma.auditLog.findMany({ where: { entityId: listing.id, action: "LISTING_TRANSITION" } });
    expect(audit.length).toBeGreaterThanOrEqual(4);

    // LISTING_LIVE notification was created for the actor.
    const notif = await prisma.notification.findFirst({ where: { orgId: account.orgId, type: "LISTING_LIVE" } });
    expect(notif).not.toBeNull();
  });

  it("ATTENTION is recoverable via re-queue", async () => {
    const account = await registerOrg(server.app, { email: "l4@test.dev", orgName: "L4 Motors" });
    const vehicle = await createVehicleDirect(testPrisma(), account.orgId, {});
    const { listing } = (await createListingViaApi(account, vehicle.id)).json() as { listing: { id: string } };
    for (const to of ["READY", "QUEUED", "IN_PROGRESS"] as const) {
      await server.app.inject({
        method: "POST",
        url: `/api/v1/listings/${listing.id}/transition`,
        headers: authHeaders(account),
        payload: { to },
      });
    }
    const attention = await server.app.inject({
      method: "POST",
      url: `/api/v1/listings/${listing.id}/transition`,
      headers: authHeaders(account),
      payload: { to: "ATTENTION", failureReason: "Photo upload stalled" },
    });
    expect(attention.statusCode).toBe(200);
    expect((attention.json() as { listing: { failureReason: string } }).listing.failureReason).toContain("Photo");

    const requeue = await server.app.inject({
      method: "POST",
      url: `/api/v1/listings/${listing.id}/transition`,
      headers: authHeaders(account),
      payload: { to: "QUEUED" },
    });
    expect(requeue.statusCode).toBe(200);
    expect((requeue.json() as { listing: { failureReason: string | null } }).listing.failureReason).toBeNull();
  });

  it("salespeople cannot transition listings owned by others", async () => {
    const owner = await registerOrg(server.app, { email: "own@l5.test", orgName: "L5 Motors" });
    await addMember(testPrisma(), { email: "sam@l5.test", name: "Sam", orgId: owner.orgId, role: "SALESPERSON" });
    await addMember(testPrisma(), { email: "rio@l5.test", name: "Rio", orgId: owner.orgId, role: "SALESPERSON" });
    const samToken = await loginAs(server.app, "sam@l5.test");
    const rioToken = await loginAs(server.app, "rio@l5.test");
    const prisma = testPrisma();

    const sam = await prisma.user.findUniqueOrThrow({ where: { email: "sam@l5.test" } });
    const vehicle = await createVehicleDirect(prisma, owner.orgId, {});
    const res = await server.app.inject({
      method: "POST",
      url: "/api/v1/listings",
      headers: { authorization: `Bearer ${samToken}`, "x-org-id": owner.orgId },
      payload: { vehicleId: vehicle.id, assigneeId: sam.id },
    });
    const { listing } = res.json() as { listing: { id: string } };

    // Rio (not assignee) tries to move it — forbidden.
    const rioTry = await server.app.inject({
      method: "POST",
      url: `/api/v1/listings/${listing.id}/transition`,
      headers: { authorization: `Bearer ${rioToken}`, "x-org-id": owner.orgId },
      payload: { to: "READY" },
    });
    expect(rioTry.statusCode).toBe(403);

    // Sam (assignee) can.
    const samTry = await server.app.inject({
      method: "POST",
      url: `/api/v1/listings/${listing.id}/transition`,
      headers: { authorization: `Bearer ${samToken}`, "x-org-id": owner.orgId },
      payload: { to: "READY" },
    });
    expect(samTry.statusCode).toBe(200);

    // Owner (transition-all) can too.
    const ownerTry = await server.app.inject({
      method: "POST",
      url: `/api/v1/listings/${listing.id}/transition`,
      headers: authHeaders(owner),
      payload: { to: "QUEUED" },
    });
    expect(ownerTry.statusCode).toBe(200);
  });

  it("removing a listing of a SUSPECTED_SOLD vehicle confirms the sale", async () => {
    const account = await registerOrg(server.app, { email: "l6@test.dev", orgName: "L6 Motors" });
    const prisma = testPrisma();
    const vehicle = await createVehicleDirect(prisma, account.orgId, { status: "SUSPECTED_SOLD" });
    const listing = await prisma.listing.create({
      data: {
        orgId: account.orgId,
        vehicleId: vehicle.id,
        status: "NEEDS_REMOVAL",
        title: "2020 Toyota Camry",
        assigneeId: account.userId,
        createdById: account.userId,
      },
    });

    const res = await server.app.inject({
      method: "POST",
      url: `/api/v1/listings/${listing.id}/transition`,
      headers: authHeaders(account),
      payload: { to: "REMOVED", note: "Sold and removed" },
    });
    expect(res.statusCode).toBe(200);

    const updated = await prisma.vehicle.findUnique({ where: { id: vehicle.id } });
    expect(updated?.status).toBe("SOLD");
    expect(updated?.soldAt).not.toBeNull();
    const notif = await prisma.notification.findFirst({ where: { orgId: account.orgId, type: "SOLD_CONFIRMED" } });
    expect(notif).not.toBeNull();
  });

  it("queue/mine returns only my queued listings with photos", async () => {
    const account = await registerOrg(server.app, { email: "l7@test.dev", orgName: "L7 Motors" });
    const prisma = testPrisma();
    const vehicle = await createVehicleDirect(prisma, account.orgId, {});
    await prisma.vehiclePhoto.create({ data: { vehicleId: vehicle.id, url: "https://x.test/p.jpg", position: 0 } });
    const { listing } = (await createListingViaApi(account, vehicle.id)).json() as { listing: { id: string } };
    await prisma.listing.update({ where: { id: listing.id }, data: { status: "QUEUED", assigneeId: account.userId } });

    const res = await server.app.inject({
      method: "GET",
      url: "/api/v1/listings/queue/mine",
      headers: authHeaders(account),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: { id: string; vehicle: { photos: unknown[] } }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.vehicle.photos).toHaveLength(1);
  });
});
