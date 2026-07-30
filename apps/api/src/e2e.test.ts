import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "./lib/env.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("API e2e", () => {
  let app: FastifyInstance;
  let accessToken = "";
  let orgId = "";

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    const env = loadEnv({
      ...process.env,
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? "test-access-secret-min-32-characters!!",
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-min-32-characters!",
    });
    app = await buildApp(env);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("health", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("register and list vehicles", async () => {
    const email = `e2e-${Date.now()}@test.okauto.local`;
    const reg = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "TestPass123!",
        name: "E2E User",
        organizationName: `E2E Motors ${Date.now()}`,
      },
    });
    expect(reg.statusCode).toBe(201);
    const body = reg.json();
    accessToken = body.accessToken;
    orgId = body.organization.id;

    const create = await app.inject({
      method: "POST",
      url: `/v1/orgs/${orgId}/vehicles`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        vin: "1HGCM82633A123456",
        year: 2019,
        make: "Honda",
        model: "Civic",
        priceCents: 1599900,
        photoUrls: ["https://example.com/car.jpg"],
      },
    });
    expect(create.statusCode).toBe(201);

    const list = await app.inject({
      method: "GET",
      url: `/v1/orgs/${orgId}/vehicles`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBeGreaterThanOrEqual(1);

    const vehicleId = create.json().vehicle.id;
    const describe = await app.inject({
      method: "POST",
      url: `/v1/orgs/${orgId}/vehicles/${vehicleId}/describe`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { tone: "professional" },
    });
    expect(describe.statusCode).toBe(200);
    expect(describe.json().provider).toBe("template");

    const listing = await app.inject({
      method: "POST",
      url: `/v1/orgs/${orgId}/listings`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { vehicleId, channel: "marketplace" },
    });
    expect(listing.statusCode).toBe(201);
    expect(listing.json().listing.status).toBe("ready");
  });
});
