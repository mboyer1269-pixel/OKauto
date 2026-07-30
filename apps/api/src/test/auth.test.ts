import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BuiltServer } from "../server.js";
import { buildTestServer, loginAs, registerOrg, resetDb, testPrisma } from "./helpers.js";

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

describe("auth", () => {
  it("registers an org with owner membership, default template and manual source", async () => {
    const account = await registerOrg(server.app, { email: "owner@acme.test", orgName: "Acme Autos" });
    const prisma = testPrisma();

    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: account.userId, orgId: account.orgId } },
    });
    expect(membership?.role).toBe("ORG_OWNER");

    const template = await prisma.descriptionTemplate.findFirst({ where: { orgId: account.orgId } });
    expect(template?.isDefault).toBe(true);

    const source = await prisma.importSource.findFirst({ where: { orgId: account.orgId, type: "MANUAL" } });
    expect(source).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({ where: { orgId: account.orgId, action: "ORG_REGISTERED" } });
    expect(audit).not.toBeNull();
  });

  it("rejects duplicate registration emails", async () => {
    await registerOrg(server.app, { email: "dup@test.dev", orgName: "Dup Motors" });
    const res = await server.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "dup@test.dev", password: "test-password-123", name: "Dup", orgName: "Dup 2" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("logs in and returns memberships; rejects bad passwords uniformly", async () => {
    await registerOrg(server.app, { email: "login@test.dev", orgName: "Login Motors" });
    const bad = await server.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "login@test.dev", password: "wrong-password" },
    });
    expect(bad.statusCode).toBe(401);

    const token = await loginAs(server.app, "login@test.dev");
    const me = await server.app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    const body = me.json() as { user: { email: string }; memberships: { role: string }[] };
    expect(body.user.email).toBe("login@test.dev");
    expect(body.memberships[0]?.role).toBe("ORG_OWNER");
  });

  it("refresh rotates tokens and detects reuse (revokes session family)", async () => {
    await registerOrg(server.app, { email: "rotate@test.dev", orgName: "Rotate Motors" });
    const login = await server.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "rotate@test.dev", password: "test-password-123" },
    });
    const cookie = login.cookies.find((c) => c.name === "okauto_rt");
    expect(cookie).toBeDefined();

    // First refresh rotates successfully.
    const refreshed = await server.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      cookies: { okauto_rt: cookie!.value },
    });
    expect(refreshed.statusCode).toBe(200);
    const newCookie = refreshed.cookies.find((c) => c.name === "okauto_rt");
    expect(newCookie!.value).not.toBe(cookie!.value);

    // Reusing the OLD token is an attack signal → all sessions revoked.
    const reuse = await server.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      cookies: { okauto_rt: cookie!.value },
    });
    expect(reuse.statusCode).toBe(401);

    // Even the rotated token is now revoked.
    const afterRevoke = await server.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      cookies: { okauto_rt: newCookie!.value },
    });
    expect(afterRevoke.statusCode).toBe(401);
  });

  it("invite flow: owner invites, invitee accepts and joins with role", async () => {
    const owner = await registerOrg(server.app, { email: "inviter@test.dev", orgName: "Invite Motors" });
    const inviteRes = await server.app.inject({
      method: "POST",
      url: "/api/v1/invites",
      headers: { authorization: `Bearer ${owner.accessToken}`, "x-org-id": owner.orgId },
      payload: { email: "sales@join.test", role: "SALESPERSON" },
    });
    expect(inviteRes.statusCode).toBe(201);
    const { token } = inviteRes.json() as { token: string };

    const accept = await server.app.inject({
      method: "POST",
      url: "/api/v1/auth/invites/accept",
      payload: { token, name: "Sam Sales", password: "test-password-123" },
    });
    expect(accept.statusCode).toBe(200);
    const prisma = testPrisma();
    const membership = await prisma.membership.findFirst({
      where: { orgId: owner.orgId, user: { email: "sales@join.test" } },
    });
    expect(membership?.role).toBe("SALESPERSON");
    expect(membership?.status).toBe("ACTIVE");

    const notification = await prisma.notification.findFirst({
      where: { orgId: owner.orgId, type: "MEMBER_JOINED", userId: owner.userId },
    });
    expect(notification).not.toBeNull();
  });
});
