import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BuiltServer } from "../server.js";
import {
  addMember,
  authHeaders,
  buildTestServer,
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

describe("RBAC + tenant isolation", () => {
  it("salesperson cannot manage org, members, or templates", async () => {
    const owner = await registerOrg(server.app, { email: "o@rbac.test", orgName: "RBAC Motors" });
    await addMember(testPrisma(), { email: "s@rbac.test", name: "Sales", orgId: owner.orgId, role: "SALESPERSON" });
    const salesToken = await loginAs(server.app, "s@rbac.test");
    const headers = { authorization: `Bearer ${salesToken}`, "x-org-id": owner.orgId };

    const orgUpdate = await server.app.inject({
      method: "PATCH",
      url: "/api/v1/orgs/current",
      headers,
      payload: { name: "Hacked" },
    });
    expect(orgUpdate.statusCode).toBe(403);

    const invite = await server.app.inject({
      method: "POST",
      url: "/api/v1/invites",
      headers,
      payload: { email: "x@x.test" },
    });
    expect(invite.statusCode).toBe(403);

    const template = await server.app.inject({
      method: "POST",
      url: "/api/v1/description-templates",
      headers,
      payload: { name: "T", body: "{{make}}", isDefault: false },
    });
    expect(template.statusCode).toBe(403);

    const analytics = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview",
      headers,
    });
    expect(analytics.statusCode).toBe(403);
  });

  it("platform admin endpoints are closed to org users", async () => {
    const owner = await registerOrg(server.app, { email: "o2@rbac.test", orgName: "RBAC Motors 2" });
    const res = await server.app.inject({
      method: "GET",
      url: "/api/v1/admin/orgs",
      headers: authHeaders(owner),
    });
    expect(res.statusCode).toBe(403);
  });

  it("cross-tenant access is denied (org A token + org B header)", async () => {
    const a = await registerOrg(server.app, { email: "a@tenant.test", orgName: "Tenant A" });
    const b = await registerOrg(server.app, { email: "b@tenant.test", orgName: "Tenant B" });

    // A's token with B's org id → 403 membership check.
    const res = await server.app.inject({
      method: "GET",
      url: "/api/v1/vehicles",
      headers: { authorization: `Bearer ${a.accessToken}`, "x-org-id": b.orgId },
    });
    expect(res.statusCode).toBe(403);

    // B creates a vehicle; A cannot see it even with a direct id guess.
    const created = await server.app.inject({
      method: "POST",
      url: "/api/v1/vehicles",
      headers: authHeaders(b),
      payload: { make: "Honda", model: "Civic", priceCents: 1200000, stockNumber: "B-1" },
    });
    expect(created.statusCode).toBe(201);
    const vehicleId = (created.json() as { vehicle: { id: string } }).vehicle.id;

    const peek = await server.app.inject({
      method: "GET",
      url: `/api/v1/vehicles/${vehicleId}`,
      headers: authHeaders(a),
    });
    expect(peek.statusCode).toBe(404);
  });

  it("unauthenticated requests are rejected", async () => {
    const res = await server.app.inject({ method: "GET", url: "/api/v1/vehicles", headers: { "x-org-id": "x" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("managers can invite but cannot assign owner role", async () => {
    const owner = await registerOrg(server.app, { email: "own@mgr.test", orgName: "Mgr Motors" });
    await addMember(testPrisma(), { email: "mgr@mgr.test", name: "Mgr", orgId: owner.orgId, role: "ORG_MANAGER" });
    const mgrToken = await loginAs(server.app, "mgr@mgr.test");

    const invite = await server.app.inject({
      method: "POST",
      url: "/api/v1/invites",
      headers: { authorization: `Bearer ${mgrToken}`, "x-org-id": owner.orgId },
      payload: { email: "newbie@mgr.test", role: "SALESPERSON" },
    });
    expect(invite.statusCode).toBe(201);

    // Manager tries to escalate owner's role — schema restricts to assignable set.
    const members = await server.app.inject({
      method: "GET",
      url: "/api/v1/members",
      headers: { authorization: `Bearer ${mgrToken}`, "x-org-id": owner.orgId },
    });
    const ownerMembership = (members.json() as { members: { id: string; role: string }[] }).members.find(
      (m) => m.role === "ORG_OWNER",
    );
    const demote = await server.app.inject({
      method: "PATCH",
      url: `/api/v1/members/${ownerMembership!.id}`,
      headers: { authorization: `Bearer ${mgrToken}`, "x-org-id": owner.orgId },
      payload: { role: "SALESPERSON" },
    });
    // Owner's role can't be changed by a manager (assignableRoles excludes it for OWNER targets).
    expect([400, 403]).toContain(demote.statusCode);
  });
});
