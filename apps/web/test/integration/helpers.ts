import { prisma } from "@lotpilot/db";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { createSessionToken, SESSION_COOKIE } from "@/server/session";

export { prisma };

let counter = 0;
export function unique(prefix: string): string {
  counter++;
  return `${prefix}-${Date.now()}-${counter}`;
}

export interface TestUser {
  id: string;
  email: string;
  cookie: string;
}

export async function createUser(
  opts: { platformRole?: "ADMIN" | "USER" } = {},
): Promise<TestUser> {
  const email = `${unique("user")}@test.local`;
  const user = await prisma.user.create({
    data: {
      email,
      name: "Test User",
      passwordHash: await bcrypt.hash("test-password-123", 4),
      platformRole: opts.platformRole ?? "USER",
    },
  });
  const token = await createSessionToken({ userId: user.id, email });
  return { id: user.id, email, cookie: `${SESSION_COOKIE}=${token}` };
}

export async function createOrg(ownerId: string): Promise<{ id: string; slug: string }> {
  const slug = unique("org");
  const org = await prisma.organization.create({
    data: {
      name: `Org ${slug}`,
      slug,
      settings: { disclaimers: ["Test disclaimer."], soldDetectionThreshold: 2 },
      memberships: { create: { userId: ownerId, role: "OWNER" } },
    },
  });
  return { id: org.id, slug };
}

export async function addMember(
  orgId: string,
  userId: string,
  role: "OWNER" | "MANAGER" | "SALESPERSON",
): Promise<void> {
  await prisma.membership.create({ data: { organizationId: orgId, userId, role } });
}

export async function createApiToken(orgId: string, userId: string): Promise<string> {
  const value = `lp_test_${randomBytes(16).toString("hex")}`;
  await prisma.apiToken.create({
    data: {
      organizationId: orgId,
      userId,
      name: "test token",
      tokenHash: createHash("sha256").update(value).digest("hex"),
    },
  });
  return value;
}

/** Build a Request for a route handler with sane defaults + unique client IP. */
export function makeRequest(
  path: string,
  opts: {
    method?: string;
    cookie?: string;
    bearer?: string;
    json?: unknown;
    body?: BodyInit;
    headers?: Record<string, string>;
  } = {},
): Request {
  const headers: Record<string, string> = {
    "x-forwarded-for": `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    ...opts.headers,
  };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  let body: BodyInit | undefined = opts.body;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  return new Request(`http://localhost:3000${path}`, {
    method: opts.method ?? "GET",
    headers,
    body,
  });
}

export function params<T extends Record<string, string>>(values: T): { params: Promise<T> } {
  return { params: Promise.resolve(values) };
}

export async function body<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
