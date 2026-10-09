import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@okauto/database";
import bcrypt from "bcryptjs";
import { POST as loginHandler } from "@/app/api/v1/auth/login/route";
import { POST as extensionAuthHandler } from "@/app/api/v1/extension/route";
import { PATCH as updateMemberHandler } from "@/app/api/v1/organizations/members/[id]/route";
import { DELETE as deleteMemberHandler } from "@/app/api/v1/organizations/members/[id]/route";
import { hashToken } from "@/lib/auth";

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
  return { status: response.status, data: await response.json() };
}

async function useApiKey(rawKey: string) {
  return extensionAuthHandler(
    makeRequest("http://localhost/api/v1/extension", {
      method: "POST",
      body: JSON.stringify({ apiKey: rawKey }),
    }) as never,
  );
}

describe("API key revocation", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ownerEmail = `owner-keys-${suffix}@example.com`;
  const staffEmail = `staff-keys-${suffix}@example.com`;
  const ownerPassword = "Owner!Keys12ab";
  const staffPassword = "Staff!Keys12ab";

  let orgId = "";
  let ownerToken = "";
  let staffUserId = "";
  let staffMemberId = "";

  beforeAll(async () => {
    const [ownerHash, staffHash] = await Promise.all([
      bcrypt.hash(ownerPassword, 12),
      bcrypt.hash(staffPassword, 12),
    ]);
    const org = await prisma.organization.create({
      data: { name: "Concession clés", slug: `keys-${suffix}` },
    });
    orgId = org.id;
    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        name: "Owner Keys",
        passwordHash: ownerHash,
      },
    });
    const staff = await prisma.user.create({
      data: {
        email: staffEmail,
        name: "Staff Keys",
        passwordHash: staffHash,
        provisionedByOrganizationId: org.id,
      },
    });
    staffUserId = staff.id;
    const membership = await prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: staff.id,
        role: "SALESPERSON",
      },
    });
    staffMemberId = membership.id;
    await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const session = await login(ownerEmail, ownerPassword);
    expect(session.status).toBe(200);
    ownerToken = session.data.accessToken;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: [ownerEmail, staffEmail] } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await prisma.apiKey.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.organizationMember.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (orgId) await prisma.organization.delete({ where: { id: orgId } });
  });

  async function issueKey(name: string) {
    const raw = `suivia_test_${name}_${suffix}`;
    await prisma.apiKey.create({
      data: {
        organizationId: orgId,
        userId: staffUserId,
        name,
        keyHash: hashToken(raw),
        keyPrefix: raw.slice(0, 12),
      },
    });
    return raw;
  }

  it("rejects an API key after the member password is reset", async () => {
    const raw = await issueKey("after-reset");
    expect((await useApiKey(raw)).status).toBe(200);

    const reset = await updateMemberHandler(
      makeRequest(
        `http://localhost/api/v1/organizations/members/${staffMemberId}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({ password: "Staff!ResetKeys8b" }),
        },
      ),
      { params: Promise.resolve({ id: staffMemberId }) },
    );
    expect(reset.status).toBe(200);
    expect((await useApiKey(raw)).status).toBe(401);
  });

  it("rejects an API key after the member is removed", async () => {
    const extra = await prisma.user.create({
      data: {
        email: `removed-${suffix}@example.com`,
        name: "Removed Keys",
        passwordHash: await bcrypt.hash("Removed!Keys12ab", 12),
        provisionedByOrganizationId: orgId,
      },
    });
    const membership = await prisma.organizationMember.create({
      data: {
        organizationId: orgId,
        userId: extra.id,
        role: "SALESPERSON",
      },
    });
    const raw = `suivia_test_removed_${suffix}`;
    await prisma.apiKey.create({
      data: {
        organizationId: orgId,
        userId: extra.id,
        name: "removed",
        keyHash: hashToken(raw),
        keyPrefix: raw.slice(0, 12),
      },
    });
    expect((await useApiKey(raw)).status).toBe(200);

    const removed = await deleteMemberHandler(
      makeRequest(
        `http://localhost/api/v1/organizations/members/${membership.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${ownerToken}` },
        },
      ),
      { params: Promise.resolve({ id: membership.id }) },
    );
    expect(removed.status).toBe(200);
    expect((await useApiKey(raw)).status).toBe(401);

    await prisma.apiKey.deleteMany({ where: { userId: extra.id } });
    await prisma.user.deleteMany({ where: { id: extra.id } });
  });

  it("rejects an API key after the account is deactivated", async () => {
    const raw = await issueKey("after-deactivate");
    expect((await useApiKey(raw)).status).toBe(200);

    await prisma.user.update({
      where: { id: staffUserId },
      data: { isActive: false },
    });
    expect((await useApiKey(raw)).status).toBe(401);

    await prisma.user.update({
      where: { id: staffUserId },
      data: { isActive: true },
    });
  });
});
