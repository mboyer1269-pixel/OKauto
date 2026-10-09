import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@okauto/database";
import bcrypt from "bcryptjs";
import { POST as loginHandler } from "@/app/api/v1/auth/login/route";
import { POST as inviteMemberHandler } from "@/app/api/v1/organizations/members/route";
import { DELETE as deleteMemberHandler } from "@/app/api/v1/organizations/members/[id]/route";
import { POST as acceptInviteHandler } from "@/app/api/v1/invitations/[token]/accept/route";
import { GET as previewInviteHandler } from "@/app/api/v1/invitations/[token]/route";
import {
  MEMBER_INVITE_LOGIN_OR_CREATE_MESSAGE,
  MEMBER_INVITE_SESSION_MISMATCH_MESSAGE,
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

function tokenFromInviteUrl(url: string) {
  return url.split("/invitation/")[1] ?? "";
}

describe("invite accept — brute force, enumeration, rehire", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ownerEmail = `owner-accept-${suffix}@example.com`;
  const otherEmail = `other-accept-${suffix}@example.com`;
  const victimEmail = `victim-accept-${suffix}@example.com`;
  const missingEmail = `missing-accept-${suffix}@example.com`;
  const rehireEmail = `rehire-accept-${suffix}@example.com`;
  const password = "Accept!Security12";
  const previousTrustProxy = process.env.TRUST_PROXY;

  let orgId = "";
  let otherOrgId = "";
  let ownerToken = "";
  let otherToken = "";
  let victimUserId = "";

  beforeAll(async () => {
    process.env.TRUST_PROXY = "true";
    const hash = await bcrypt.hash(password, 12);
    const org = await prisma.organization.create({
      data: { name: "Concession Accept", slug: `accept-${suffix}` },
    });
    const otherOrg = await prisma.organization.create({
      data: { name: "Concession Other", slug: `accept-other-${suffix}` },
    });
    orgId = org.id;
    otherOrgId = otherOrg.id;

    const owner = await prisma.user.create({
      data: { email: ownerEmail, name: "Owner Accept", passwordHash: hash },
    });
    const other = await prisma.user.create({
      data: { email: otherEmail, name: "Other Accept", passwordHash: hash },
    });
    const victim = await prisma.user.create({
      data: { email: victimEmail, name: "Victim Accept", passwordHash: hash },
    });
    victimUserId = victim.id;

    await prisma.organizationMember.createMany({
      data: [
        { organizationId: orgId, userId: owner.id, role: "OWNER" },
        { organizationId: otherOrgId, userId: other.id, role: "OWNER" },
        { organizationId: otherOrgId, userId: victim.id, role: "SALESPERSON" },
      ],
    });

    const ownerLogin = await login(ownerEmail, password);
    const otherLogin = await login(otherEmail, password);
    expect(ownerLogin.status).toBe(200);
    expect(otherLogin.status).toBe(200);
    ownerToken = ownerLogin.data.accessToken;
    otherToken = otherLogin.data.accessToken;
  });

  afterAll(async () => {
    if (previousTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previousTrustProxy;

    const emails = [
      ownerEmail,
      otherEmail,
      victimEmail,
      missingEmail,
      rehireEmail,
    ];
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
    await prisma.organization.deleteMany({
      where: { id: { in: [orgId, otherOrgId].filter(Boolean) } },
    });
  });

  async function invite(email: string, name: string) {
    const response = await inviteMemberHandler(
      makeRequest("http://localhost/api/v1/organizations/members", {
        method: "POST",
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ name, email, role: "ADMIN" }),
      }),
      { params: Promise.resolve({}) },
    );
    const data = await response.json();
    expect(response.status).toBe(201);
    return tokenFromInviteUrl(data.inviteUrl);
  }

  it("does not attach after 100 password guesses on an existing account", async () => {
    const token = await invite(victimEmail, "Victim");
    const ip = "203.0.113.201";

    const statuses: number[] = [];
    for (let i = 0; i < 101; i += 1) {
      const response = await acceptInviteHandler(
        makeRequest(`http://localhost/api/v1/invitations/${token}/accept`, {
          method: "POST",
          headers: { "x-forwarded-for": ip },
          body: JSON.stringify({
            password: i === 100 ? password : `Wrong!Pass${i}xx`,
          }),
        }),
        { params: Promise.resolve({ token }) },
      );
      statuses.push(response.status);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect((await response.json()).accessToken).toBeUndefined();
    }

    expect(statuses.some((status) => status === 429 || status === 401 || status === 404)).toBe(
      true,
    );

    const attached = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId: victimUserId },
      },
    });
    expect(attached).toBeNull();
  });

  it("accepts with the invited account session and does not issue tokens", async () => {
    const token = await invite(victimEmail, "Victim session");
    const session = await login(victimEmail, password);
    expect(session.status).toBe(200);

    const accept = await acceptInviteHandler(
      makeRequest(`http://localhost/api/v1/invitations/${token}/accept`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.data.accessToken}`,
          "x-forwarded-for": "203.0.113.202",
        },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ token }) },
    );
    const data = await accept.json();
    expect(accept.status).toBe(200);
    expect(data.attached).toBe(true);
    expect(data.memberId).toBeTruthy();
    expect(data.accessToken).toBeUndefined();
    expect(data.refreshToken).toBeUndefined();

    const attached = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId: victimUserId },
      },
    });
    expect(attached?.role).toBe("ADMIN");
  });

  it("returns 403 when another session tries to accept", async () => {
    const token = await invite(victimEmail, "Victim mismatch");
    const accept = await acceptInviteHandler(
      makeRequest(`http://localhost/api/v1/invitations/${token}/accept`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${otherToken}`,
          "x-forwarded-for": "203.0.113.203",
        },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ token }) },
    );
    const data = await accept.json();
    expect(accept.status).toBe(403);
    expect(data.error).toBe(MEMBER_INVITE_SESSION_MISMATCH_MESSAGE);
    expect(data.accessToken).toBeUndefined();
  });

  it("does not reveal whether the invited email already has an account", async () => {
    const existingToken = await invite(victimEmail, "Victim enum");
    const missingToken = await invite(missingEmail, "Missing enum");

    const existingPreview = await previewInviteHandler(
      makeRequest(`http://localhost/api/v1/invitations/${existingToken}`),
      { params: Promise.resolve({ token: existingToken }) },
    );
    const missingPreview = await previewInviteHandler(
      makeRequest(`http://localhost/api/v1/invitations/${missingToken}`),
      { params: Promise.resolve({ token: missingToken }) },
    );
    const existingPreviewData = await existingPreview.json();
    const missingPreviewData = await missingPreview.json();

    expect(existingPreview.status).toBe(200);
    expect(missingPreview.status).toBe(200);
    expect(existingPreviewData.prompt).toBe(MEMBER_INVITE_LOGIN_OR_CREATE_MESSAGE);
    expect(missingPreviewData.prompt).toBe(existingPreviewData.prompt);
    expect(Object.keys(existingPreviewData).sort()).toEqual(
      Object.keys(missingPreviewData).sort(),
    );
    expect(existingPreviewData).not.toHaveProperty("accountExists");
    expect(missingPreviewData).not.toHaveProperty("accountExists");

    const existingPost = await acceptInviteHandler(
      makeRequest(
        `http://localhost/api/v1/invitations/${existingToken}/accept`,
        {
          method: "POST",
          headers: { "x-forwarded-for": "203.0.113.204" },
          body: JSON.stringify({}),
        },
      ),
      { params: Promise.resolve({ token: existingToken }) },
    );
    const missingPost = await acceptInviteHandler(
      makeRequest(
        `http://localhost/api/v1/invitations/${missingToken}/accept`,
        {
          method: "POST",
          headers: { "x-forwarded-for": "203.0.113.205" },
          body: JSON.stringify({}),
        },
      ),
      { params: Promise.resolve({ token: missingToken }) },
    );
    const existingPostData = await existingPost.json();
    const missingPostData = await missingPost.json();

    expect(existingPost.status).toBe(401);
    expect(missingPost.status).toBe(401);
    expect(existingPostData.error).toBe(MEMBER_INVITE_LOGIN_OR_CREATE_MESSAGE);
    expect(missingPostData.error).toBe(existingPostData.error);
  });

  it("lets a removed last-org member be rehired while staying active", async () => {
    const token = await invite(rehireEmail, "Rehire");
    const created = await acceptInviteHandler(
      makeRequest(`http://localhost/api/v1/invitations/${token}/accept`, {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.206" },
        body: JSON.stringify({ password }),
      }),
      { params: Promise.resolve({ token }) },
    );
    const createdData = await created.json();
    expect(created.status).toBe(200);
    const memberId = createdData.memberId as string;
    const leftoverAccess = createdData.accessToken as string;
    expect(leftoverAccess).toBeTruthy();

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: rehireEmail },
    });
    expect(user.isActive).toBe(true);

    const removed = await deleteMemberHandler(
      makeRequest(
        `http://localhost/api/v1/organizations/members/${memberId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${ownerToken}` },
        },
      ),
      { params: Promise.resolve({ id: memberId }) },
    );
    expect(removed.status).toBe(200);

    const afterRemoval = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(afterRemoval.isActive).toBe(true);
    expect(
      await prisma.organizationMember.findMany({ where: { userId: user.id } }),
    ).toHaveLength(0);

    const rehireToken = await invite(rehireEmail, "Rehire again");
    const rehired = await acceptInviteHandler(
      makeRequest(`http://localhost/api/v1/invitations/${rehireToken}/accept`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${leftoverAccess}`,
          "x-forwarded-for": "203.0.113.207",
        },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ token: rehireToken }) },
    );
    const rehiredData = await rehired.json();
    expect(rehired.status).toBe(200);
    expect(rehiredData.attached).toBe(true);
    expect(rehiredData.accessToken).toBeUndefined();

    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId: user.id },
      },
    });
    expect(membership).toBeTruthy();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isActive,
    ).toBe(true);
  });
});
