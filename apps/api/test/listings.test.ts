import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember, auth, createOrg, createTestHarness, registerUser, type TestHarness, type TestUser,
} from "./helpers.js";

describe("listings lifecycle", () => {
  let h: TestHarness;
  let owner: TestUser;
  let sales: TestUser;
  let orgId: string;
  let vehicleId: string;

  beforeAll(async () => {
    h = await createTestHarness();
    owner = await registerUser(h.app);
    orgId = (await createOrg(h.app, owner.accessToken)).id;
    sales = await addMember(h.app, owner.accessToken, orgId, "SALESPERSON");
    const created = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/vehicles`,
      headers: auth(owner.accessToken),
      payload: { vin: "2T1BURHE4JC970118", year: 2018, make: "Toyota", model: "Corolla", priceCents: 1549500 },
    });
    vehicleId = created.json().vehicle.id;
  });
  afterAll(async () => {
    await h.close();
  });

  it("walks the full lifecycle: draft -> prepared -> published -> removed", async () => {
    const create = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/listings`,
      headers: auth(sales.accessToken),
      payload: { vehicleId },
    });
    expect(create.statusCode).toBe(201);
    const listingId = create.json().listing.id;
    expect(create.json().listing.status).toBe("DRAFT");

    // Duplicate prevention for the same user+vehicle.
    const dup = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/listings`,
      headers: auth(sales.accessToken),
      payload: { vehicleId },
    });
    expect(dup.statusCode).toBe(409);

    const prepared = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/listings/${listingId}/events`,
      headers: auth(sales.accessToken),
      payload: { type: "PREPARED", message: "Form filled by extension" },
    });
    expect(prepared.statusCode).toBe(201);
    expect(prepared.json().listing.status).toBe("PREPARED");
    expect(prepared.json().listing.preparedAt).not.toBeNull();

    const published = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/listings/${listingId}/events`,
      headers: auth(sales.accessToken),
      payload: { type: "PUBLISHED", remoteUrl: "https://www.facebook.com/marketplace/item/42" },
    });
    expect(published.json().listing.status).toBe("ACTIVE");
    expect(published.json().listing.remoteUrl).toContain("facebook.com");

    // Active listings cannot be cancelled via DELETE.
    const cantDelete = await h.app.inject({
      method: "DELETE",
      url: `/api/v1/orgs/${orgId}/listings/${listingId}`,
      headers: auth(sales.accessToken),
    });
    expect(cantDelete.statusCode).toBe(409);

    const removed = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/listings/${listingId}/events`,
      headers: auth(sales.accessToken),
      payload: { type: "REMOVED", message: "Removed after sale" },
    });
    expect(removed.json().listing.status).toBe("REMOVED");

    // Full event history is preserved.
    const detail = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/listings/${listingId}`,
      headers: auth(sales.accessToken),
    });
    const types = detail.json().events.map((e: { type: string }) => e.type);
    expect(types).toEqual(expect.arrayContaining(["NOTE", "PREPARED", "PUBLISHED", "REMOVED"]));
  });

  it("prevents salespeople from touching others' listings; managers may", async () => {
    const create = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/listings`,
      headers: auth(sales.accessToken),
      payload: { vehicleId },
    });
    const listingId = create.json().listing.id;

    const otherSales = await addMember(h.app, owner.accessToken, orgId, "SALESPERSON");
    const denied = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/listings/${listingId}/events`,
      headers: auth(otherSales.accessToken),
      payload: { type: "REMOVED" },
    });
    expect(denied.statusCode).toBe(403);

    const managerOk = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/listings/${listingId}/events`,
      headers: auth(owner.accessToken),
      payload: { type: "NOTE", message: "Manager checked in" },
    });
    expect(managerOk.statusCode).toBe(201);
  });

  it("refuses listings for sold vehicles", async () => {
    await h.app.inject({
      method: "PATCH",
      url: `/api/v1/orgs/${orgId}/vehicles/${vehicleId}`,
      headers: auth(owner.accessToken),
      payload: { status: "SOLD" },
    });
    const refused = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/listings`,
      headers: auth(owner.accessToken),
      payload: { vehicleId },
    });
    expect(refused.statusCode).toBe(409);
  });

  it("feeds analytics: overview and per-salesperson stats", async () => {
    const overview = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/analytics/overview`,
      headers: auth(owner.accessToken),
    });
    expect(overview.statusCode).toBe(200);
    expect(overview.json().listings.publishedLast7Days).toBeGreaterThanOrEqual(1);

    const people = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/analytics/salespeople`,
      headers: auth(owner.accessToken),
    });
    expect(people.statusCode).toBe(200);
    const salesRow = people.json().salespeople.find((s: { userId: string }) => s.userId === sales.user.id);
    expect(salesRow.totalListings).toBeGreaterThanOrEqual(2);
    expect(salesRow.publishedLast7Days).toBeGreaterThanOrEqual(1);

    const activity = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/analytics/activity`,
      headers: auth(owner.accessToken),
    });
    expect(activity.statusCode).toBe(200);
    expect(activity.json().days.length).toBeGreaterThanOrEqual(1);
  });

  it("records audit logs visible to managers", async () => {
    const logs = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/audit-logs`,
      headers: auth(owner.accessToken),
    });
    expect(logs.statusCode).toBe(200);
    const actions = logs.json().items.map((l: { action: string }) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["listing.create", "org.create"]));

    const salesDenied = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/audit-logs`,
      headers: auth(sales.accessToken),
    });
    expect(salesDenied.statusCode).toBe(403);
  });
});
