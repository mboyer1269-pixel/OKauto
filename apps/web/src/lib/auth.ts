import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { db, type Role } from "@okauto/db";
import { hasMinRole, type Role as SharedRole } from "@okauto/shared";

const SESSION_COOKIE = "okauto_session";
const SESSION_DAYS = 14;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function createSession(userId: string, meta?: { userAgent?: string; ip?: string }) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      userAgent: meta?.userAgent,
      ip: meta?.ip,
    },
  });
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export type AuthContext = {
  user: {
    id: string;
    email: string;
    name: string;
  };
  membership: {
    id: string;
    orgId: string;
    role: Role;
  };
  org: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
  authMethod: "session" | "extension";
};

async function loadMembership(userId: string, orgId?: string) {
  const membership = await db.membership.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      ...(orgId ? { orgId } : {}),
    },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });
  return membership;
}

export async function getSessionUser(): Promise<{
  id: string;
  email: string;
  name: string;
} | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) {
    if (session) await db.session.delete({ where: { id: session.id } });
    return null;
  }
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

export async function authenticateRequest(
  req: NextRequest,
  minRole: SharedRole = "SALESPERSON",
): Promise<AuthContext | { error: string; status: number }> {
  const authHeader = req.headers.get("authorization");
  const orgHeader = req.headers.get("x-okauto-org");

  if (authHeader?.startsWith("Bearer ")) {
    const raw = authHeader.slice("Bearer ".length).trim();
    const token = await db.extensionToken.findUnique({
      where: { tokenHash: hashToken(raw) },
      include: { user: true, org: true },
    });
    if (!token || token.revokedAt || (token.expiresAt && token.expiresAt < new Date())) {
      return { error: "Invalid or revoked extension token", status: 401 };
    }
    const membership = await db.membership.findUnique({
      where: {
        userId_orgId: { userId: token.userId, orgId: token.orgId },
      },
    });
    if (!membership || membership.status !== "ACTIVE") {
      return { error: "Membership inactive", status: 403 };
    }
    if (!hasMinRole(membership.role as SharedRole, minRole)) {
      return { error: "Insufficient permissions", status: 403 };
    }
    await db.extensionToken.update({
      where: { id: token.id },
      data: { lastUsedAt: new Date() },
    });
    return {
      user: {
        id: token.user.id,
        email: token.user.email,
        name: token.user.name,
      },
      membership: {
        id: membership.id,
        orgId: membership.orgId,
        role: membership.role,
      },
      org: {
        id: token.org.id,
        name: token.org.name,
        slug: token.org.slug,
        timezone: token.org.timezone,
      },
      authMethod: "extension",
    };
  }

  const jar = await cookies();
  const cookieToken = jar.get(SESSION_COOKIE)?.value;
  if (!cookieToken) {
    return { error: "Unauthorized", status: 401 };
  }
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(cookieToken) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) {
    return { error: "Unauthorized", status: 401 };
  }

  const membership = await loadMembership(session.userId, orgHeader ?? undefined);
  if (!membership) {
    return { error: "No active organization membership", status: 403 };
  }
  if (!hasMinRole(membership.role as SharedRole, minRole)) {
    return { error: "Insufficient permissions", status: 403 };
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    membership: {
      id: membership.id,
      orgId: membership.orgId,
      role: membership.role,
    },
    org: {
      id: membership.org.id,
      name: membership.org.name,
      slug: membership.org.slug,
      timezone: membership.org.timezone,
    },
    authMethod: "session",
  };
}

export async function requirePageAuth(minRole: SharedRole = "SALESPERSON") {
  const user = await getSessionUser();
  if (!user) return null;
  const membership = await loadMembership(user.id);
  if (!membership) return null;
  if (!hasMinRole(membership.role as SharedRole, minRole)) return null;
  return {
    user,
    membership,
    org: membership.org,
  };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}
