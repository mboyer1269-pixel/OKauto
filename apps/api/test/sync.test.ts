import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { notifications, vehicles } from "../src/db/schema.js";
import { processPendingJobs, scheduleDueFeeds } from "../src/jobs/workers.js";
import {
  SAMPLE_CSV, auth, createOrg, createTestHarness, registerUser, type TestHarness, type TestUser,
} from "./helpers.js";

describe("inventory import & sync", () => {
  let h: TestHarness;
  let owner: TestUser;
  let orgId: string;

  beforeAll(async () => {
    h = await createTestHarness();
    owner = await registerUser(h.app);
    orgId = (await createOrg(h.app, owner.accessToken)).id;
  });
  afterAll(async () => {
    await h.close();
  });

  it("imports a CSV, normalizing rows into canonical vehicles", async () => {
    const res = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/imports/csv`,
      headers: auth(owner.accessToken),
      payload: { csv: SAMPLE_CSV },
    });
    expect(res.statusCode).toBe(200);
    const { stats } = res.json();
    expect(stats).toMatchObject({ total: 3, created: 3, updated: 0, skipped: 0 });

    const list = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/vehicles?sort=year&dir=desc`,
      headers: auth(owner.accessToken),
    });
    const items = list.json().items;
    expect(items).toHaveLength(3);
    const tesla = items.find((v: { vin: string }) => v.vin === "5YJ3E1EA2KF317000");
    expect(tesla).toMatchObject({
      make: "Tesla",
      priceCents: 2745000,
      mileage: 41200,
      fuelType: "ELECTRIC",
      source: "CSV",
    });
    expect(tesla.photoUrls).toEqual(["https://cdn.test/2.jpg", "https://cdn.test/3.jpg"]);
  });

  it("re-import updates prices, detects missing vehicles as sold and alerts listers", async () => {
    // Salesperson lists the Ford before it sells.
    const sales = await registerUser(h.app);
    const invite = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/invites`,
      headers: auth(owner.accessToken),
      payload: { email: sales.user.email, role: "SALESPERSON" },
    });
    await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/invites/accept",
      headers: auth(sales.accessToken),
      payload: { token: invite.json().invite.token },
    });
    const fordRow = await h.db.select().from(vehicles).where(eq(vehicles.vin, "1FTFW1ET9DFC10312"));
    const fordId = fordRow[0]!.id;
    const listing = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/listings`,
      headers: auth(sales.accessToken),
      payload: { vehicleId: fordId },
    });
    expect(listing.statusCode).toBe(201);
    const listingId = listing.json().listing.id;
    await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/listings/${listingId}/events`,
      headers: auth(sales.accessToken),
      payload: { type: "PUBLISHED", remoteUrl: "https://www.facebook.com/marketplace/item/123" },
    });

    // Second import: Ford missing, Tesla price dropped.
    const secondCsv = `VIN,Year,Make,Model,Price
1HGCM82633A004352,2003,Honda,Accord,"$8,995"
5YJ3E1EA2KF317000,2019,Tesla,Model 3,"$25,900"`;
    const res = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/imports/csv`,
      headers: auth(owner.accessToken),
      payload: { csv: secondCsv, markMissingAsSold: true },
    });
    expect(res.statusCode).toBe(200);
    const { stats } = res.json();
    expect(stats.markedSold).toBe(1);
    expect(stats.priceChanges).toBe(1);

    // Run queued alert jobs.
    const processed = await processPendingJobs({ db: h.db, ai: h.ctx.ai });
    expect(processed).toBeGreaterThanOrEqual(1);

    // Salesperson receives a sold alert for their active listing.
    const notifs = await h.app.inject({
      method: "GET",
      url: "/api/v1/notifications",
      headers: auth(sales.accessToken),
    });
    const types = notifs.json().items.map((n: { type: string }) => n.type);
    expect(types).toContain("VEHICLE_SOLD");

    const [ford] = await h.db.select().from(vehicles).where(eq(vehicles.id, fordId));
    expect(ford!.status).toBe("SOLD");
    expect(ford!.soldDetectedAt).not.toBeNull();

    // Third import: Ford reappears -> restored to AVAILABLE.
    const thirdCsv = `VIN,Year,Make,Model,Price
1HGCM82633A004352,2003,Honda,Accord,"$8,995"
5YJ3E1EA2KF317000,2019,Tesla,Model 3,"$25,900"
1FTFW1ET9DFC10312,2013,Ford,F-150,"$18,500"`;
    const res3 = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/imports/csv`,
      headers: auth(owner.accessToken),
      payload: { csv: thirdCsv, markMissingAsSold: true },
    });
    expect(res3.json().stats.restored).toBe(1);
    const [fordAfter] = await h.db.select().from(vehicles).where(eq(vehicles.id, fordId));
    expect(fordAfter!.status).toBe("AVAILABLE");
  });

  it("reports row-level errors without failing the whole import", async () => {
    const csv = `VIN,Year,Make,Model
NOT_A_VIN,1800,,Missing
1GNSKBKC6FR215366,2015,Chevrolet,Tahoe`;
    const res = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/imports/csv`,
      headers: auth(owner.accessToken),
      payload: { csv },
    });
    expect(res.statusCode).toBe(200);
    const { stats } = res.json();
    expect(stats.created).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0].row).toBe(1);
  });

  it("syncs a URL feed through the queue with scheduling and dedupe", async () => {
    const feedJson = {
      vehicles: [
        {
          vin: "WBA8E9G58GNT43708",
          year: 2016,
          make: "BMW",
          model: "328i",
          trim: "xDrive",
          price: 17950,
          mileage: 67420,
          fuel_type: "Gasoline",
          images: ["https://cdn.test/bmw1.jpg"],
        },
      ],
    };
    const stubFetch = (async () => new Response(JSON.stringify(feedJson), { status: 200 })) as unknown as typeof fetch;

    const createFeed = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/feeds`,
      headers: auth(owner.accessToken),
      payload: {
        name: "Website JSON feed",
        type: "JSON_URL",
        url: "https://dealer.test/inventory.json",
        intervalMinutes: 30,
        markMissingAsSold: false,
      },
    });
    expect(createFeed.statusCode).toBe(201);
    const feedId = createFeed.json().feed.id;

    // Manual sync enqueues one job; a second request dedupes.
    const sync1 = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/feeds/${feedId}/sync`,
      headers: auth(owner.accessToken),
    });
    expect(sync1.statusCode).toBe(202);
    expect(sync1.json().queued).toBe(true);
    const sync2 = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/feeds/${feedId}/sync`,
      headers: auth(owner.accessToken),
    });
    expect(sync2.json().queued).toBe(false);

    await processPendingJobs({ db: h.db, ai: h.ctx.ai, fetchImpl: stubFetch });

    const [bmw] = await h.db.select().from(vehicles).where(eq(vehicles.vin, "WBA8E9G58GNT43708"));
    expect(bmw).toBeTruthy();
    expect(bmw!.source).toBe("FEED");
    expect(bmw!.priceCents).toBe(1795000);

    // Scheduler: after a manual run the feed is not due; force lastRunAt back.
    const dueBefore = await scheduleDueFeeds(h.db);
    expect(dueBefore).toBe(0);

    const { feedSources } = await import("../src/db/schema.js");
    await h.db
      .update(feedSources)
      .set({ lastRunAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(feedSources.id, feedId));
    const due = await scheduleDueFeeds(h.db);
    expect(due).toBe(1);
    await processPendingJobs({ db: h.db, ai: h.ctx.ai, fetchImpl: stubFetch });

    // Sync health shows runs.
    const runs = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/sync-runs`,
      headers: auth(owner.accessToken),
    });
    expect(runs.json().runs.length).toBeGreaterThanOrEqual(2);
    expect(runs.json().runs[0].status).toBe("SUCCEEDED");
  });

  it("marks feed failures and retries with backoff", async () => {
    const failFetch = (async () => new Response("gone", { status: 404 })) as unknown as typeof fetch;
    const createFeed = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/feeds`,
      headers: auth(owner.accessToken),
      payload: { name: "Broken feed", type: "CSV_URL", url: "https://dealer.test/broken.csv", intervalMinutes: 0 },
    });
    const feedId = createFeed.json().feed.id;
    await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/feeds/${feedId}/sync`,
      headers: auth(owner.accessToken),
    });
    await processPendingJobs({ db: h.db, ai: h.ctx.ai, fetchImpl: failFetch });

    const feeds = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/feeds`,
      headers: auth(owner.accessToken),
    });
    const broken = feeds.json().feeds.find((f: { id: string }) => f.id === feedId);
    expect(broken.lastStatus).toBe("FAILED");

    // The job goes back to PENDING with a future runAt (backoff) — check jobs table.
    const { jobs } = await import("../src/db/schema.js");
    const rows = await h.db.select().from(jobs).where(eq(jobs.type, "feed_sync"));
    const retried = rows.find((j) => j.lastError?.includes("HTTP 404"));
    expect(retried).toBeTruthy();
    expect(retried!.status).toBe("PENDING");
    expect(retried!.runAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("cleans up notifications state (read-all)", async () => {
    const unread = await h.app.inject({
      method: "GET",
      url: "/api/v1/notifications/unread-count",
      headers: auth(owner.accessToken),
    });
    expect(unread.statusCode).toBe(200);
    const readAll = await h.app.inject({
      method: "POST",
      url: "/api/v1/notifications/read-all",
      headers: auth(owner.accessToken),
    });
    expect(readAll.statusCode).toBe(200);
    const after = await h.app.inject({
      method: "GET",
      url: "/api/v1/notifications/unread-count",
      headers: auth(owner.accessToken),
    });
    expect(after.json().count).toBe(0);
  });
});

describe("notifications table sanity", () => {
  it("has expected indexes usable via query (smoke)", async () => {
    const h = await createTestHarness();
    const u = await registerUser(h.app);
    const org = await createOrg(h.app, u.accessToken);
    await h.db.insert(notifications).values({
      orgId: org.id,
      userId: u.user.id,
      type: "SYSTEM",
      title: "T",
      body: "B",
    });
    const res = await h.app.inject({ method: "GET", url: "/api/v1/notifications", headers: auth(u.accessToken) });
    expect(res.json().total).toBe(1);
    await h.close();
  });
});
