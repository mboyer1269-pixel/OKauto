import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@okauto/database";
import bcrypt from "bcryptjs";
import { POST as loginHandler } from "@/app/api/v1/auth/login/route";
import { GET as currentUserHandler } from "@/app/api/v1/auth/me/route";
import { GET as listVehiclesHandler } from "@/app/api/v1/vehicles/route";
import { POST as inviteMemberHandler } from "@/app/api/v1/organizations/members/route";
import { DELETE as deleteMemberHandler } from "@/app/api/v1/organizations/members/[id]/route";
import { POST as acceptInviteHandler } from "@/app/api/v1/invitations/[token]/accept/route";
import {
  MEMBER_INVITE_SESSION_MISMATCH_MESSAGE,
} from "@/lib/member-provisioning";
import {
  INVITATION_TOKEN_SCOPE,
  verifyAccessToken,
} from "@/lib/auth";

function makeRequest(url: string, options: RequestInit = {}): Request {
  return new Request(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });
}

async function login(
  email: string,
  password: string,
  next?: string,
) {
  const response = await loginHandler(
    makeRequest("http://localhost/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, ...(next ? { next } : {}) }),
    }) as never,
  );
  const data = await response.json();
  return { status: response.status, data };
}

function tokenFromInviteUrl(url: string) {
  return url.split("/invitation/")[1] ?? "";
}

describe("cold rehire via invitation-scoped login", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ownerEmail = `owner-cold-${suffix}@example.com`;
  const staffEmail = `staff-cold-${suffix}@example.com`;
  const otherEmail = `other-cold-${suffix}@example.com`;
  const password = "Cold!Rehire12ab";

  let orgId = "";
  let ownerToken = "";
  let staffUserId = "";

  beforeAll(async () => {
    const hash = await bcrypt.hash(password, 12);
    const org = await prisma.organization.create({
      data: { name: "Concession Cold", slug: `cold-${suffix}` },
    });
    orgId = org.id;
    const owner = await prisma.user.create({
      data: { email: ownerEmail, name: "Owner Cold", passwordHash: hash },
    });
    await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const ownerLogin = await login(ownerEmail, password);
    expect(ownerLogin.status).toBe(200);
    ownerToken = ownerLogin.data.accessToken;
  });

  afterAll(async () => {
    const emails = [ownerEmail, staffEmail, otherEmail];
    await prisma.organizationInvite.deleteMany({
      where: { email: { in: emails } },
    });
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    if (userIds.length) {
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.organizationMember.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (orgId) await prisma.organization.delete({ where: { id: orgId } });
  });

  async function invite(email: string, name: string) {
    const response = await inviteMemberHandler(
      makeRequest("http://localhost/api/v1/organizations/members", {
        method: "POST",
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ name, email, role: "SALESPERSON" }),
      }),
      { params: Promise.resolve({}) },
    );
    const data = await response.json();
    expect(response.status).toBe(201);
    return tokenFromInviteUrl(data.inviteUrl);
  }

  it("lets a removed account log in via the invite link, accept, and get a normal session", async () => {
    const createToken = await invite(staffEmail, "Staff Cold");
    const created = await acceptInviteHandler(
      makeRequest(`http://localhost/api/v1/invitations/${createToken}/accept`, {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
      { params: Promise.resolve({ token: createToken }) },
    );
    const createdData = await created.json();
    expect(created.status).toBe(200);
    staffUserId = (await prisma.user.findUniqueOrThrow({
      where: { email: staffEmail },
    })).id;

    const removed = await deleteMemberHandler(
      makeRequest(
        `http://localhost/api/v1/organizations/members/${createdData.memberId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${ownerToken}` },
        },
      ),
      { params: Promise.resolve({ id: createdData.memberId }) },
    );
    expect(removed.status).toBe(200);

    const blocked = await login(staffEmail, password);
    expect(blocked.status).toBe(403);
    expect(blocked.data.error).toBe("Aucune organisation associée à ce compte");
    expect(blocked.data.accessToken).toBeUndefined();

    const rehireToken = await invite(staffEmail, "Staff Cold again");
    const next = `/invitation/${rehireToken}`;
    const scoped = await login(staffEmail, password, next);
    expect(scoped.status).toBe(200);
    expect(scoped.data.scope).toBe(INVITATION_TOKEN_SCOPE);
    expect(scoped.data.accessToken).toBeTruthy();
    expect(scoped.data.refreshToken).toBeUndefined();
    expect(scoped.data.organization).toBeNull();

    const payload = await verifyAccessToken(scoped.data.accessToken);
    expect(payload?.scope).toBe(INVITATION_TOKEN_SCOPE);
    expect(payload?.orgId).toBe("");
    expect(payload?.email).toBe(staffEmail);
    if (payload?.exp != null && payload.iat != null) {
      expect(payload.exp - payload.iat).toBeLessThanOrEqual(10 * 60);
      expect(payload.exp - payload.iat).toBeGreaterThan(8 * 60);
    }

    const me = await currentUserHandler(
      makeRequest("http://localhost/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${scoped.data.accessToken}` },
      }),
      { params: Promise.resolve({}) },
    );
    expect(me.status).toBe(401);

    const vehicles = await listVehiclesHandler(
      makeRequest("http://localhost/api/v1/vehicles", {
        headers: { Authorization: `Bearer ${scoped.data.accessToken}` },
      }),
      { params: Promise.resolve({}) },
    );
    expect(vehicles.status).toBe(401);

    const otherToken = await invite(otherEmail, "Someone else");
    const mismatch = await acceptInviteHandler(
      makeRequest(`http://localhost/api/v1/invitations/${otherToken}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${scoped.data.accessToken}` },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ token: otherToken }) },
    );
    expect(mismatch.status).toBe(403);
    expect((await mismatch.json()).error).toBe(
      MEMBER_INVITE_SESSION_MISMATCH_MESSAGE,
    );

    const accepted = await acceptInviteHandler(
      makeRequest(`http://localhost/api/v1/invitations/${rehireToken}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${scoped.data.accessToken}` },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ token: rehireToken }) },
    );
    const acceptedData = await accepted.json();
    expect(accepted.status).toBe(200);
    expect(acceptedData.attached).toBe(true);
    expect(acceptedData.accessToken).toBeTruthy();
    expect(acceptedData.refreshToken).toBeTruthy();
    expect(acceptedData.organization.id).toBe(orgId);

    const sessionPayload = await verifyAccessToken(acceptedData.accessToken);
    expect(sessionPayload?.scope).toBeUndefined();
    expect(sessionPayload?.orgId).toBe(orgId);

    const meAgain = await currentUserHandler(
      makeRequest("http://localhost/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${acceptedData.accessToken}` },
      }),
      { params: Promise.resolve({}) },
    );
    expect(meAgain.status).toBe(200);

    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId: staffUserId },
      },
    });
    expect(membership).toBeTruthy();

    const fullLogin = await login(staffEmail, password);
    expect(fullLogin.status).toBe(200);
    expect(fullLogin.data.organization.id).toBe(orgId);
  });
});
