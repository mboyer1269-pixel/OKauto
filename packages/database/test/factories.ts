import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma, Role } from "../src/index";

function suffix(): string {
  return randomBytes(4).toString("hex");
}

export async function createTestOrganization(opts?: {
  name?: string;
  slug?: string;
}) {
  const id = suffix();
  return prisma.organization.create({
    data: {
      name: opts?.name ?? `Test org ${id}`,
      slug: opts?.slug ?? `test-org-${id}`,
    },
  });
}

export async function createTestUser(opts?: {
  email?: string;
  name?: string;
  password?: string;
}) {
  const id = suffix();
  const password = opts?.password ?? "Test1234!";
  return prisma.user.create({
    data: {
      email: opts?.email ?? `user-${id}@test.okauto.local`,
      name: opts?.name ?? `Test user ${id}`,
      passwordHash: await bcrypt.hash(password, 4),
    },
  });
}

export async function createTestMembership(params: {
  organizationId: string;
  userId: string;
  role?: Role;
}) {
  return prisma.organizationMember.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId,
      role: params.role ?? Role.OWNER,
    },
  });
}

export async function createIsolatedOrgWithOwner(role: Role = Role.OWNER) {
  const organization = await createTestOrganization();
  const password = "Test1234!";
  const user = await createTestUser({ password });
  const membership = await createTestMembership({
    organizationId: organization.id,
    userId: user.id,
    role,
  });
  return { organization, user, membership, password };
}
