import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@okauto/database";
import bcrypt from "bcryptjs";
import { POST as loginHandler } from "@/app/api/v1/auth/login/route";
import { POST as refreshHandler } from "@/app/api/v1/auth/refresh/route";
import { GET as currentUserHandler } from "@/app/api/v1/auth/me/route";
import { POST as inviteMemberHandler } from "@/app/api/v1/organizations/members/route";
import { PATCH as updateMemberHandler } from "@/app/api/v1/organizations/members/[id]/route";
import {
  MEMBER_CREATE_CONFLICT_MESSAGE,
  MEMBER_PASSWORD_RESET_FORBIDDEN_MESSAGE,
} from "@/lib/member-provisioning";

function makeRequest(url: string, options: RequestInit = {}): Request {
  return new Request(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });
}

async function login(email: string, password: string) {
  const response = await loginHandler(
    makeRequest("http://localhost/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }) as never,
  );
  const data = await response.json();
  return { status: response.status, data };
}

describe("member takeover prevention", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ownerAEmail = `owner-a-${suffix}@example.com`;
  const ownerBEmail = `owner-b-${suffix}@example.com`;
  const staffBEmail = `staff-b-${suffix}@example.com`;
  const passwordA = "Alpha!Password12";
  const passwordB = "Bravo!Password12";
  const staffPassword = "Staff!Temporary7a";
  const resetPassword = "Staff!ResetNow8b";

  let orgAId = "";
  let orgBId = "";
  let userAId = "";
  let ownerBToken = "";
  let staffBMemberId = "";

  beforeAll(async () => {
    const [hashA, hashB] = await Promise.all([
      bcrypt.hash(passwordA, 12),
      bcrypt.hash(passwordB, 12),
    ]);

    const orgA = await prisma.organization.create({
      data: { name: "Concession A", slug: `concession-a-${suffix}` },
    });
    const orgB = await prisma.organization.create({
      data: { name: "Concession B", slug: `concession-b-${suffix}` },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;

    const userA = await prisma.user.create({
      data: {
        email: ownerAEmail,
        name: "Owner A",
        passwordHash: hashA,
      },
    });
    const userB = await prisma.user.create({
      data: {
        email: ownerBEmail,
        name: "Owner B",
        passwordHash: hashB,
      },
    });
    userAId = userA.id;

    await prisma.organizationMember.createMany({
      data: [
        { organizationId: orgAId, userId: userA.id, role: "OWNER" },
        { organizationId: orgBId, userId: userB.id, role: "OWNER" },
      ],
    });

    const loginB = await login(ownerBEmail, passwordB);
    expect(loginB.status).toBe(200);
    ownerBToken = loginB.data.accessToken;
  });

  afterAll(async () => {
    const emails = [ownerAEmail, ownerBEmail, staffBEmail];
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
    await prisma.organization.deleteMany({
      where: { id: { in: [orgAId, orgBId].filter(Boolean) } },
    });
  });

  it("does not attach org A's account when org B invites the same email", async () => {
    const beforeHash = await prisma.user.findUniqueOrThrow({
      where: { id: userAId },
      select: { passwordHash: true },
    });

    const invite = await inviteMemberHandler(
      makeRequest("http://localhost/api/v1/organizations/members", {
        method: "POST",
        headers: { Authorization: `Bearer ${ownerBToken}` },
        body: JSON.stringify({
          name: "Owner A hijack",
          email: ownerAEmail,
          password: "Hijack!Password9c",
          role: "SALESPERSON",
        }),
      }),
      { params: Promise.resolve({}) },
    );
    const inviteData = await invite.json();

    expect(invite.status).toBe(409);
    expect(inviteData.error).toBe(MEMBER_CREATE_CONFLICT_MESSAGE);

    const memberships = await prisma.organizationMember.findMany({
      where: { userId: userAId },
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].organizationId).toBe(orgAId);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: userAId },
      select: { passwordHash: true },
    });
    expect(after.passwordHash).toBe(beforeHash.passwordHash);

    const stillA = await login(ownerAEmail, passwordA);
    expect(stillA.status).toBe(200);
    expect(stillA.data.organization.id).toBe(orgAId);
  });

  it("returns 403 when org B tries to reset org A's password", async () => {
    const poisoned = await prisma.organizationMember.create({
      data: {
        organizationId: orgBId,
        userId: userAId,
        role: "SALESPERSON",
      },
    });

    const beforeHash = await prisma.user.findUniqueOrThrow({
      where: { id: userAId },
      select: { passwordHash: true },
    });

    const reset = await updateMemberHandler(
      makeRequest(
        `http://localhost/api/v1/organizations/members/${poisoned.id}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${ownerBToken}` },
          body: JSON.stringify({ password: "Stolen!Password9c" }),
        },
      ),
      { params: Promise.resolve({ id: poisoned.id }) },
    );
    const resetData = await reset.json();

    expect(reset.status).toBe(403);
    expect(resetData.error).toBe(MEMBER_PASSWORD_RESET_FORBIDDEN_MESSAGE);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: userAId },
      select: { passwordHash: true },
    });
    expect(after.passwordHash).toBe(beforeHash.passwordHash);

    const stillA = await login(ownerAEmail, passwordA);
    expect(stillA.status).toBe(200);
  });

  it("still lets a dealership create and reset its own staff account", async () => {
    const invite = await inviteMemberHandler(
      makeRequest("http://localhost/api/v1/organizations/members", {
        method: "POST",
        headers: { Authorization: `Bearer ${ownerBToken}` },
        body: JSON.stringify({
          name: "Staff B",
          email: staffBEmail,
          password: staffPassword,
          role: "SALESPERSON",
        }),
      }),
      { params: Promise.resolve({}) },
    );
    const inviteData = await invite.json();
    expect(invite.status).toBe(201);
    expect(inviteData.temporaryPasswordCreated).toBe(true);
    staffBMemberId = inviteData.id;

    const created = await prisma.user.findUniqueOrThrow({
      where: { email: staffBEmail },
    });
    expect(created.provisionedByOrganizationId).toBe(orgBId);

    const firstLogin = await login(staffBEmail, staffPassword);
    expect(firstLogin.status).toBe(200);

    const reset = await updateMemberHandler(
      makeRequest(
        `http://localhost/api/v1/organizations/members/${staffBMemberId}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${ownerBToken}` },
          body: JSON.stringify({ password: resetPassword }),
        },
      ),
      { params: Promise.resolve({ id: staffBMemberId }) },
    );
    expect(reset.status).toBe(200);
    expect((await reset.json()).passwordUpdated).toBe(true);

    const afterReset = await login(staffBEmail, resetPassword);
    expect(afterReset.status).toBe(200);
    expect(afterReset.data.organization.id).toBe(orgBId);
  });

  it("rejects the previous access and refresh tokens after a password reset", async () => {
    const session = await login(staffBEmail, resetPassword);
    expect(session.status).toBe(200);
    const oldAccess = session.data.accessToken as string;
    const oldRefresh = session.data.refreshToken as string;
    expect(oldAccess).toBeTruthy();
    expect(oldRefresh).toBeTruthy();

    const stillValid = await currentUserHandler(
      makeRequest("http://localhost/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${oldAccess}` },
      }),
      { params: Promise.resolve({}) },
    );
    expect(stillValid.status).toBe(200);

    const reset = await updateMemberHandler(
      makeRequest(
        `http://localhost/api/v1/organizations/members/${staffBMemberId}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${ownerBToken}` },
          body: JSON.stringify({ password: "Staff!ResetAgain9c" }),
        },
      ),
      { params: Promise.resolve({ id: staffBMemberId }) },
    );
    expect(reset.status).toBe(200);

    const me = await currentUserHandler(
      makeRequest("http://localhost/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${oldAccess}` },
      }),
      { params: Promise.resolve({}) },
    );
    expect(me.status).toBe(401);

    const refresh = await refreshHandler(
      makeRequest("http://localhost/api/v1/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: oldRefresh }),
      }) as never,
    );
    expect(refresh.status).toBe(401);
  });
});
