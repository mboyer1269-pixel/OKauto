import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import type { BuiltServer } from "../server.js";
import { authHeaders, buildTestServer, registerOrg, resetDb, testPrisma } from "./helpers.js";
import { csvToFeedItems, parseCsv } from "../modules/imports/csv.js";

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

describe("csv parser", () => {
  it("parses quoted fields, escaped quotes and CRLF", () => {
    const rows = parseCsv('a,b,c\r\n"1,2","say ""hi""",3\n4,5,6\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1,2", 'say "hi"', "3"],
      ["4", "5", "6"],
    ]);
  });

  it("maps aliased headers and photo lists", () => {
    const { items, headerErrors } = csvToFeedItems(
      "VIN,Stock #,Year,Make,Model,Price,Miles,Photos\n1HGCM82633A004352,A-1,2003,Honda,Accord,\"$5,995\",98400,https://x.test/1.jpg|https://x.test/2.jpg",
    );
    // Note: "Stock #" is not a known alias; stockNumber is dropped — make/model/price still map.
    expect(headerErrors).toHaveLength(0);
    expect(items[0]).toMatchObject({ vin: "1HGCM82633A004352", year: "2003", make: "Honda", price: 5995 });
    expect((items[0] as { photoUrls: string[] }).photoUrls).toHaveLength(2);
  });

  it("reports missing required headers", () => {
    const { headerErrors } = csvToFeedItems("foo,bar\n1,2");
    expect(headerErrors.length).toBeGreaterThan(0);
  });
});

describe("CSV import endpoint", () => {
  it("imports rows with stats and is idempotent on re-import", async () => {
    const account = await registerOrg(server.app, { email: "imp@test.dev", orgName: "Imp Motors" });
    const csv = [
      "vin,stocknumber,year,make,model,price,mileage",
      "1HGCM82633A004352,A-1,2003,Honda,Accord,5995,98400",
      "1FTFW1ET4EFA12345,A-2,2014,Ford,F-150,21995,88210",
      "BADVIN,A-3,2020,Kia,Soul,9995,1000",
    ].join("\n");

    const first = await server.app.inject({
      method: "POST",
      url: "/api/v1/imports/csv",
      headers: authHeaders(account),
      payload: { csv },
    });
    expect(first.statusCode).toBe(200);
    const stats1 = (first.json() as { stats: { created: number; failed: number } }).stats;
    expect(stats1.created).toBe(3); // BADVIN falls back to stock dedupe, still imports

    const second = await server.app.inject({
      method: "POST",
      url: "/api/v1/imports/csv",
      headers: authHeaders(account),
      payload: { csv },
    });
    const stats2 = (second.json() as { stats: { created: number; unchanged: number } }).stats;
    expect(stats2.created).toBe(0);
    expect(stats2.unchanged).toBe(3);

    const prisma = testPrisma();
    expect(await prisma.vehicle.count({ where: { orgId: account.orgId } })).toBe(3);
    const runs = await prisma.importRun.findMany({ where: { source: { orgId: account.orgId } } });
    expect(runs.length).toBeGreaterThanOrEqual(2);
  });

  it("row-level failures don't block valid rows", async () => {
    const account = await registerOrg(server.app, { email: "imp2@test.dev", orgName: "Imp2 Motors" });
    const csv = "make,model,price,stocknumber\nHonda,Accord,5995,A-1\n,Broken,,A-2\nFord,F-150,21995,A-3";
    const res = await server.app.inject({
      method: "POST",
      url: "/api/v1/imports/csv",
      headers: authHeaders(account),
      payload: { csv },
    });
    const stats = (res.json() as { stats: { created: number; failed: number; errors: unknown[] } }).stats;
    expect(stats.created).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.errors).toHaveLength(1);
  });
});

describe("JSON feed source + run-sync", () => {
  it("pulls a feed end-to-end through a real HTTP fetch", async () => {
    const account = await registerOrg(server.app, { email: "feed@test.dev", orgName: "Feed Motors" });
    const feed: Server = createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          vehicles: [
            { vin: "1HGCM82633A004352", stockNumber: "F-1", make: "Honda", model: "Accord", price: 5995, mileage: 98000 },
          ],
        }),
      );
    });
    await new Promise<void>((resolve) => feed.listen(0, resolve));
    const port = (feed.address() as { port: number }).port;

    try {
      const created = await server.app.inject({
        method: "POST",
        url: "/api/v1/imports/sources",
        headers: authHeaders(account),
        payload: { name: "Website feed", type: "JSON_FEED", config: { feedUrl: `http://127.0.0.1:${port}/feed` } },
      });
      expect(created.statusCode).toBe(201);
      const sourceId = (created.json() as { source: { id: string } }).source.id;

      const run = await server.app.inject({
        method: "POST",
        url: `/api/v1/imports/sources/${sourceId}/run-sync`,
        headers: authHeaders(account),
      });
      expect(run.statusCode).toBe(200);
      const result = run.json() as { status: string; stats: { created: number } };
      expect(result.status).toBe("SUCCEEDED");
      expect(result.stats.created).toBe(1);

      const prisma = testPrisma();
      const source = await prisma.importSource.findUnique({ where: { id: sourceId } });
      expect(source?.lastStatus).toBe("SUCCEEDED");
      expect(source?.lastRunAt).not.toBeNull();
    } finally {
      await new Promise((resolve) => feed.close(resolve));
    }
  });
});

describe("webhook push source", () => {
  it("verifies HMAC signatures and applies items", async () => {
    const account = await registerOrg(server.app, { email: "wh@test.dev", orgName: "WH Motors" });
    const created = await server.app.inject({
      method: "POST",
      url: "/api/v1/imports/sources",
      headers: authHeaders(account),
      payload: { name: "DMS push", type: "WEBHOOK", config: { webhookSecret: "whsec-123" } },
    });
    const sourceId = (created.json() as { source: { id: string } }).source.id;

    const body = { items: [{ stockNumber: "W-1", make: "Tesla", model: "Model 3", priceCents: 2499500 }] };
    const raw = JSON.stringify(body);
    const sig = createHmac("sha256", "whsec-123").update(raw).digest("hex");

    const bad = await server.app.inject({
      method: "POST",
      url: `/api/v1/imports/webhook/${sourceId}`,
      headers: { "x-okauto-signature": "deadbeef", "content-type": "application/json" },
      payload: raw,
    });
    expect(bad.statusCode).toBe(401);

    const good = await server.app.inject({
      method: "POST",
      url: `/api/v1/imports/webhook/${sourceId}`,
      headers: { "x-okauto-signature": sig, "content-type": "application/json" },
      payload: raw,
    });
    expect(good.statusCode).toBe(200);
    const stats = (good.json() as { stats: { created: number } }).stats;
    expect(stats.created).toBe(1);
  });
});
