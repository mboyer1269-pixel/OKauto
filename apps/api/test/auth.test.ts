import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, createOrg, createTestHarness, registerUser, type TestHarness } from "./helpers.js";

describe("auth & RBAC", () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  it("registers, logs in, refreshes and logs out", async () => {
    const email = `flow-${Date.now()}@test.dev`;
    const reg = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "Sup3rSecurePass!", name: "Flow User" },
    });
    expect(reg.statusCode).toBe(201);
    const regBody = reg.json();
    expect(regBody.accessToken).toBeTruthy();
    expect(regBody.refreshToken).toBeTruthy();

    // Duplicate registration is rejected.
    const dup = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "Sup3rSecurePass!", name: "Flow User" },
    });
    expect(dup.statusCode).toBe(409);

    // Wrong password rejected without user enumeration detail.
    const badLogin = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: "WrongPass123!" },
    });
    expect(badLogin.statusCode).toBe(401);

    const login = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: "Sup3rSecurePass!" },
    });
    expect(login.statusCode).toBe(200);
    const loginBody = login.json();

    // /me works with the access token.
    const me = await h.app.inject({ method: "GET", url: "/api/v1/auth/me", headers: auth(loginBody.accessToken) });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(email);

    // Refresh rotates the token.
    const refresh = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: loginBody.refreshToken },
    });
    expect(refresh.statusCode).toBe(200);
    const newRefresh = refresh.json().refreshToken;
    expect(newRefresh).not.toBe(loginBody.refreshToken);

    // The old refresh token is revoked after rotation.
    const reuse = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: loginBody.refreshToken },
    });
    expect(reuse.statusCode).toBe(401);

    // Logout revokes the current refresh token.
    const logout = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      payload: { refreshToken: newRefresh },
    });
    expect(logout.statusCode).toBe(200);
    const afterLogout = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: newRefresh },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("rejects weak passwords", async () => {
    const res = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "weak@test.dev", password: "short1", name: "Weak" },
    });
    expect(res.statusCode).toBe(422);
  });

  it("requires auth for protected routes", async () => {
    const res = await h.app.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("enforces org membership and role hierarchy", async () => {
    const owner = await registerUser(h.app);
    const org = await createOrg(h.app, owner.accessToken);
    const outsider = await registerUser(h.app);

    // Outsider cannot read the org.
    const denied = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${org.id}`,
      headers: auth(outsider.accessToken),
    });
    expect(denied.statusCode).toBe(403);

    // Invite the outsider as SALESPERSON.
    const invite = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${org.id}/invites`,
      headers: auth(owner.accessToken),
      payload: { email: outsider.user.email, role: "SALESPERSON" },
    });
    expect(invite.statusCode).toBe(201);
    const accept = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/invites/accept",
      headers: auth(outsider.accessToken),
      payload: { token: invite.json().invite.token },
    });
    expect(accept.statusCode).toBe(200);

    // Salesperson can read the org but cannot update it (MANAGER required).
    const read = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${org.id}`,
      headers: auth(outsider.accessToken),
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().role).toBe("SALESPERSON");

    const update = await h.app.inject({
      method: "PATCH",
      url: `/api/v1/orgs/${org.id}`,
      headers: auth(outsider.accessToken),
      payload: { name: "Hacked Motors" },
    });
    expect(update.statusCode).toBe(403);

    // Salesperson cannot see manager analytics.
    const analytics = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${org.id}/analytics/salespeople`,
      headers: auth(outsider.accessToken),
    });
    expect(analytics.statusCode).toBe(403);

    // Owner can update.
    const ownerUpdate = await h.app.inject({
      method: "PATCH",
      url: `/api/v1/orgs/${org.id}`,
      headers: auth(owner.accessToken),
      payload: { name: "Renamed Motors", settings: { staleListingDays: 10 } },
    });
    expect(ownerUpdate.statusCode).toBe(200);
    expect(ownerUpdate.json().org.name).toBe("Renamed Motors");
  });

  it("prevents cross-tenant access to another org's vehicles", async () => {
    const a = await registerUser(h.app);
    const orgA = await createOrg(h.app, a.accessToken, "Org A");
    const b = await registerUser(h.app);
    await createOrg(h.app, b.accessToken, "Org B");

    const created = await h.app.inject({
      method: "POST",
      url: `/api/v1/orgs/${orgA.id}/vehicles`,
      headers: auth(a.accessToken),
      payload: { vin: "1HGCM82633A004352", year: 2003, make: "Honda", model: "Accord" },
    });
    expect(created.statusCode).toBe(201);

    const denied = await h.app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgA.id}/vehicles`,
      headers: auth(b.accessToken),
    });
    expect(denied.statusCode).toBe(403);
  });
});
