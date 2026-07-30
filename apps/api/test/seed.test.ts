import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, seed } from "../src/db/seed.js";
import { auth, createTestHarness } from "./helpers.js";

describe("seed", () => {
  it("seeds demo data idempotently and demo users can log in", async () => {
    const h = await createTestHarness();
    const first = await seed(h.db);
    expect(first?.orgId).toBeTruthy();
    const second = await seed(h.db);
    expect(second).toBeNull(); // idempotent

    const login = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: DEMO_ACCOUNTS.sales1.email, password: DEMO_ACCOUNTS.sales1.password },
    });
    expect(login.statusCode).toBe(200);
    const body = login.json();
    expect(body.orgs[0].name).toBe("Demo Motors");

    const vehicles = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${first!.orgId}/vehicles`,
      headers: auth(body.accessToken),
    });
    expect(vehicles.json().total).toBe(6);

    // Admin account works.
    const adminLogin = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: DEMO_ACCOUNTS.admin.email, password: DEMO_ACCOUNTS.admin.password },
    });
    const adminOrgs = await h.app.inject({
      method: "GET",
      url: "/api/v1/admin/orgs",
      headers: auth(adminLogin.json().accessToken),
    });
    expect(adminOrgs.statusCode).toBe(200);
    await h.close();
  });
});
