import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "../src/db/schema.js";
import { processPendingJobs } from "../src/jobs/workers.js";
import { auth, createTestHarness, registerUser, type TestHarness } from "./helpers.js";

/**
 * End-to-end business journey exercised over the real HTTP interface:
 * a dealership onboards, imports inventory, a salesperson prepares and
 * publishes a Marketplace listing via the extension APIs, the vehicle sells
 * out of the feed, alerts fire, the listing is removed, and the manager
 * reviews analytics and audit history. Also covers platform admin surface.
 */
describe("E2E: dealership journey", () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  it("runs the full lifecycle from onboarding to sold-alert removal", async () => {
    // 1. Owner registers and creates the dealership.
    const owner = await registerUser(h.app, { name: "Olivia Owner" });
    const orgRes = await h.app.inject({
      method: "POST",
      url: "/api/v1/orgs",
      headers: auth(owner.accessToken),
      payload: { name: "Journey Motors", city: "Dallas", region: "TX", phone: "(555) 000-1111" },
    });
    expect(orgRes.statusCode).toBe(201);
    const orgId = orgRes.json().org.id;

    // 2. Owner invites a salesperson who accepts.
    const sales = await registerUser(h.app, { name: "Sam Seller" });
    const inviteRes = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/invites`,
      headers: auth(owner.accessToken),
      payload: { email: sales.user.email, role: "SALESPERSON" },
    });
    await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/invites/accept",
      headers: auth(sales.accessToken),
      payload: { token: inviteRes.json().invite.token },
    });

    // 3. Owner imports inventory from the DMS CSV export.
    const csv = `VIN,Stock #,Year,Make,Model,Trim,Miles,Price,Ext Color,Fuel Type
1GNSKBKC6FR215366,S3001,2015,Chevrolet,Tahoe,LT,"98,750","$26,500",Black,Gasoline
2T1BURHE4JC970118,P1003,2018,Toyota,Corolla,LE,"52,300","$15,495",Silver,Gasoline`;
    const importRes = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/imports/csv`,
      headers: auth(owner.accessToken),
      payload: { csv },
    });
    expect(importRes.json().stats.created).toBe(2);

    // 4. Salesperson browses inventory from the extension and picks the Tahoe.
    const inventory = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/vehicles?status=AVAILABLE&q=tahoe`,
      headers: auth(sales.accessToken),
    });
    const tahoe = inventory.json().items[0];
    expect(tahoe.make).toBe("Chevrolet");

    // 5. Generate an AI/template description, then fetch the Marketplace draft.
    const gen = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/vehicles/${tahoe.id}/generate-description`,
      headers: auth(sales.accessToken),
      payload: {},
    });
    expect(gen.statusCode).toBe(200);
    const draftRes = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/vehicles/${tahoe.id}/marketplace-draft`,
      headers: auth(sales.accessToken),
    });
    const draft = draftRes.json().draft;
    expect(draft.title).toBe("2015 Chevrolet Tahoe LT");
    expect(draft.price).toBe("26500");

    // 6. Create the listing intent; extension fills the form (PREPARED) and
    //    the human publishes on Marketplace (PUBLISHED).
    const listingRes = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/listings`,
      headers: auth(sales.accessToken),
      payload: { vehicleId: tahoe.id },
    });
    const listingId = listingRes.json().listing.id;
    await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/listings/${listingId}/events`,
      headers: auth(sales.accessToken),
      payload: { type: "PREPARED", message: "Fields auto-filled; review pending" },
    });
    const pub = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/listings/${listingId}/events`,
      headers: auth(sales.accessToken),
      payload: { type: "PUBLISHED", remoteUrl: "https://www.facebook.com/marketplace/item/9001" },
    });
    expect(pub.json().listing.status).toBe("ACTIVE");

    // 7. Next DMS import no longer contains the Tahoe -> sold detection.
    const soldCsv = `VIN,Stock #,Year,Make,Model,Trim,Miles,Price,Ext Color,Fuel Type
2T1BURHE4JC970118,P1003,2018,Toyota,Corolla,LE,"52,300","$15,495",Silver,Gasoline`;
    const soldImport = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/imports/csv`,
      headers: auth(owner.accessToken),
      payload: { csv: soldCsv, markMissingAsSold: true },
    });
    expect(soldImport.json().stats.markedSold).toBe(1);
    await processPendingJobs({ db: h.db, ai: h.ctx.ai });

    // 8. Salesperson sees the sold alert (extension badge + dashboard).
    const unread = await h.app.inject({
      method: "GET",
      url: "/api/v1/notifications/unread-count",
      headers: auth(sales.accessToken),
    });
    expect(unread.json().count).toBeGreaterThanOrEqual(1);
    const notifs = await h.app.inject({
      method: "GET",
      url: "/api/v1/notifications?unreadOnly=true",
      headers: auth(sales.accessToken),
    });
    const soldNotif = notifs.json().items.find((n: { type: string }) => n.type === "VEHICLE_SOLD");
    expect(soldNotif.meta.listingId).toBe(listingId);

    // 9. Salesperson removes the Marketplace listing and records it.
    const removal = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/listings/${listingId}/events`,
      headers: auth(sales.accessToken),
      payload: { type: "REMOVED", message: "Removed after sold alert" },
    });
    expect(removal.json().listing.status).toBe("REMOVED");
    await h.app.inject({
      method: "POST",
      url: `/api/v1/notifications/${soldNotif.id}/read`,
      headers: auth(sales.accessToken),
    });

    // 10. Manager reviews analytics and audit logs.
    const overview = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/analytics/overview`,
      headers: auth(owner.accessToken),
    });
    expect(overview.json().inventory.sold).toBe(1);
    const people = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/analytics/salespeople`,
      headers: auth(owner.accessToken),
    });
    const samRow = people.json().salespeople.find((s: { userId: string }) => s.userId === sales.user.id);
    expect(samRow.totalListings).toBe(1);

    const audit = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/audit-logs?pageSize=100`,
      headers: auth(owner.accessToken),
    });
    const actions = audit.json().items.map((a: { action: string }) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "org.create",
        "invite.create",
        "invite.accept",
        "inventory.import_csv",
        "listing.create",
        "listing.event.published",
        "listing.event.removed",
      ]),
    );
  });

  it("exposes health endpoints and admin surface", async () => {
    const health = await h.app.inject({ method: "GET", url: "/healthz" });
    expect(health.statusCode).toBe(200);
    const ready = await h.app.inject({ method: "GET", url: "/readyz" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().queue).toBeDefined();

    // Promote a user to platform admin directly (bootstrap operation).
    const admin = await registerUser(h.app, { name: "Root" });
    await h.db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, admin.user.id));
    // Re-login to refresh claims.
    const login = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: admin.user.email, password: "Str0ngPassw0rd!" },
    });
    const adminToken = login.json().accessToken;

    const orgs = await h.app.inject({ method: "GET", url: "/api/v1/admin/orgs", headers: auth(adminToken) });
    expect(orgs.statusCode).toBe(200);
    expect(orgs.json().orgs.length).toBeGreaterThanOrEqual(1);

    const jobsRes = await h.app.inject({ method: "GET", url: "/api/v1/admin/jobs", headers: auth(adminToken) });
    expect(jobsRes.statusCode).toBe(200);
    expect(jobsRes.json().depth).toBeDefined();

    // Non-admins are rejected.
    const pleb = await registerUser(h.app);
    const denied = await h.app.inject({
      method: "GET",
      url: "/api/v1/admin/orgs",
      headers: auth(pleb.accessToken),
    });
    expect(denied.statusCode).toBe(403);
  });
});
