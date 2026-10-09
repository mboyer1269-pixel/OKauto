import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@okauto/database";
import bcrypt from "bcryptjs";
import { POST as loginHandler } from "@/app/api/v1/auth/login/route";
import { POST as inviteMemberHandler } from "@/app/api/v1/organizations/members/route";
import { MEMBER_INVITE_RATE_LIMIT } from "@/lib/rate-limit";

function makeRequest(url: string, options: RequestInit = {}): Request {
  return new Request(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });
}

describe("member invite rate limit", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ownerEmail = `owner-rl-${suffix}@example.com`;
  const password = "Rate!Limit12ab";
  let orgId = "";
  let ownerToken = "";
  let ownerId = "";

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "Concession RL", slug: `rl-${suffix}` },
    });
    orgId = org.id;
    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        name: "Owner RL",
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    ownerId = owner.id;
    await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const login = await loginHandler(
      makeRequest("http://localhost/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: ownerEmail, password }),
      }) as never,
    );
    const data = await login.json();
    expect(login.status).toBe(200);
    ownerToken = data.accessToken;
  });

  afterAll(async () => {
    await prisma.organizationInvite.deleteMany({
      where: { organizationId: orgId },
    });
    await prisma.refreshToken.deleteMany({ where: { userId: ownerId } });
    await prisma.organizationMember.deleteMany({ where: { userId: ownerId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    if (orgId) await prisma.organization.delete({ where: { id: orgId } });
  });

  it("returns 429 after too many invitations from one dealership", async () => {
    let lastStatus = 0;
    for (let i = 0; i < MEMBER_INVITE_RATE_LIMIT.maxPerOrganization + 1; i += 1) {
      const response = await inviteMemberHandler(
        makeRequest("http://localhost/api/v1/organizations/members", {
          method: "POST",
          headers: { Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({
            name: `Invite ${i}`,
            email: `invite-${i}-${suffix}@example.com`,
            role: "SALESPERSON",
          }),
        }),
        { params: Promise.resolve({}) },
      );
      lastStatus = response.status;
      if (i < MEMBER_INVITE_RATE_LIMIT.maxPerOrganization) {
        expect(response.status).toBe(201);
      }
    }
    expect(lastStatus).toBe(429);
  });
});
