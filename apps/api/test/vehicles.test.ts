import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processPendingJobs } from "../src/jobs/workers.js";
import { auth, createOrg, createTestHarness, registerUser, type TestHarness, type TestUser } from "./helpers.js";

describe("vehicles", () => {
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

  it("creates a vehicle with a valid VIN and rejects duplicates/invalid VINs", async () => {
    const create = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/vehicles`,
      headers: auth(owner.accessToken),
      payload: {
        vin: "1hgcm82633a004352",
        year: 2003,
        make: "Honda",
        model: "Accord",
        trim: "EX V6",
        priceCents: 899500,
        mileage: 88412,
        bodyStyle: "COUPE",
        transmission: "AUTOMATIC",
        fuelType: "GASOLINE",
        features: ["Sunroof"],
        photoUrls: ["https://cdn.test/a.jpg"],
      },
    });
    expect(create.statusCode).toBe(201);
    const vehicle = create.json().vehicle;
    expect(vehicle.vin).toBe("1HGCM82633A004352"); // normalized

    const dup = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/vehicles`,
      headers: auth(owner.accessToken),
      payload: { vin: "1HGCM82633A004352", year: 2003, make: "Honda", model: "Accord" },
    });
    expect(dup.statusCode).toBe(409);

    const invalid = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/vehicles`,
      headers: auth(owner.accessToken),
      payload: { vin: "1HGCM82633A004353", year: 2003, make: "Honda", model: "Accord" },
    });
    expect(invalid.statusCode).toBe(422); // bad check digit
  });

  it("lists with search, filters and pagination", async () => {
    await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/vehicles`,
      headers: auth(owner.accessToken),
      payload: { vin: "5YJ3E1EA2KF317000", year: 2019, make: "Tesla", model: "Model 3", priceCents: 2745000 },
    });

    const all = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/vehicles`,
      headers: auth(owner.accessToken),
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().total).toBe(2);

    const search = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/vehicles?q=tesla`,
      headers: auth(owner.accessToken),
    });
    expect(search.json().total).toBe(1);
    expect(search.json().items[0].make).toBe("Tesla");

    const priced = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/vehicles?minPriceCents=1000000&sort=price&dir=desc`,
      headers: auth(owner.accessToken),
    });
    expect(priced.json().items[0].vin).toBe("5YJ3E1EA2KF317000");
  });

  it("updates a vehicle, records price history and triggers sold alerts", async () => {
    const list = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/vehicles?q=tesla`,
      headers: auth(owner.accessToken),
    });
    const vehicleId = list.json().items[0].id;

    const priceUpdate = await h.app.inject({
      method: "PATCH",
      url: `/api/v1/orgs/${orgId}/vehicles/${vehicleId}`,
      headers: auth(owner.accessToken),
      payload: { priceCents: 2650000 },
    });
    expect(priceUpdate.statusCode).toBe(200);

    const detail = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/vehicles/${vehicleId}`,
      headers: auth(owner.accessToken),
    });
    expect(detail.json().priceHistory.length).toBeGreaterThanOrEqual(2);

    // Mark sold via update — enqueues a sold_alerts job.
    const soldUpdate = await h.app.inject({
      method: "PATCH",
      url: `/api/v1/orgs/${orgId}/vehicles/${vehicleId}`,
      headers: auth(owner.accessToken),
      payload: { status: "SOLD" },
    });
    expect(soldUpdate.statusCode).toBe(200);
    const processed = await processPendingJobs({ db: h.db, ai: h.ctx.ai });
    expect(processed).toBeGreaterThanOrEqual(1);
  });

  it("generates a description via the template fallback", async () => {
    const list = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/vehicles?q=honda`,
      headers: auth(owner.accessToken),
    });
    const vehicleId = list.json().items[0].id;
    const gen = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/vehicles/${vehicleId}/generate-description`,
      headers: auth(owner.accessToken),
      payload: { tone: "FRIENDLY" },
    });
    expect(gen.statusCode).toBe(200);
    expect(gen.json().source).toBe("TEMPLATE");
    expect(gen.json().vehicle.description).toContain("Honda Accord");
    expect(gen.json().vehicle.descriptionSource).toBe("TEMPLATE");
  });

  it("returns a marketplace draft payload", async () => {
    const list = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/vehicles?q=honda`,
      headers: auth(owner.accessToken),
    });
    const vehicleId = list.json().items[0].id;
    const draft = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/vehicles/${vehicleId}/marketplace-draft`,
      headers: auth(owner.accessToken),
    });
    expect(draft.statusCode).toBe(200);
    const payload = draft.json().draft;
    expect(payload.title).toContain("Honda Accord");
    expect(payload.vehicleType).toBe("Car/van");
    expect(payload.description.length).toBeGreaterThan(30);
    expect(payload.photoUrls).toEqual(["https://cdn.test/a.jpg"]);
  });

  it("decodes VINs via the API", async () => {
    const res = await h.app.inject({
      method: "POST",
      url: "/api/v1/vin/decode",
      payload: { vin: "1HGCM82633A004352" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(true);
    expect(res.json().offline.manufacturer).toBe("Honda");
  });

  it("supports bulk actions with RBAC (manager+)", async () => {
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

    const list = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}/vehicles`,
      headers: auth(owner.accessToken),
    });
    const ids = list.json().items.map((v: { id: string }) => v.id);

    const denied = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/vehicles/bulk`,
      headers: auth(sales.accessToken),
      payload: { vehicleIds: ids, action: "ARCHIVE" },
    });
    expect(denied.statusCode).toBe(403);

    const bulk = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgId}/vehicles/bulk`,
      headers: auth(owner.accessToken),
      payload: { vehicleIds: ids, action: "GENERATE_DESCRIPTIONS" },
    });
    expect(bulk.statusCode).toBe(200);
    expect(bulk.json().affected).toBe(ids.length);
    await processPendingJobs({ db: h.db, ai: h.ctx.ai });
  });
});
