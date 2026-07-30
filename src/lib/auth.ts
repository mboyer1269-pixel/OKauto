import { createHmac, randomBytes } from "node:crypto";

import { compare } from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { db, sqlClient } from "@/db";
import { memberships, organizations, rateLimits, sessions, users } from "@/db/schema";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/http";

export const SESSION_COOKIE = "driveflow_session";
export type Role = "OWNER" | "MANAGER" | "SALESPERSON" | "VIEWER";

export interface AuthContext {
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; slug: string };
  role: Role;
  sessionId: string;
}

function hashToken(token: string): string {
  return createHmac("sha256", env().SESSION_PEPPER).update(token).digest("hex");
}

async function sessionToken(request?: NextRequest): Promise<string | undefined> {
  if (request) return request.cookies.get(SESSION_COOKIE)?.value;
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function authenticate(request?: NextRequest): Promise<AuthContext> {
  const token = await sessionToken(request);
  if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");

  const rows = await db()
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
      role: memberships.role,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()), eq(users.status, "ACTIVE")))
    .limit(1);

  const row = rows[0];
  if (!row) throw new ApiError(401, "SESSION_EXPIRED", "Your session expired. Sign in again.");
  return {
    sessionId: row.sessionId,
    user: { id: row.userId, email: row.email, name: row.name },
    organization: { id: row.organizationId, name: row.organizationName, slug: row.organizationSlug },
    role: row.role,
  };
}

const rank: Record<Role, number> = { VIEWER: 0, SALESPERSON: 1, MANAGER: 2, OWNER: 3 };

export function requireRole(context: AuthContext, minimum: Role): void {
  if (rank[context.role] < rank[minimum]) {
    throw new ApiError(403, "FORBIDDEN", `This action requires the ${minimum.toLowerCase()} role.`);
  }
}

export async function checkLoginRateLimit(key: string): Promise<void> {
  const rows = await sqlClient()<[{ attempts: number; blocked_until: Date | null }]>`
    INSERT INTO rate_limits (key, attempts, window_started_at)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE
        WHEN rate_limits.window_started_at < now() - interval '15 minutes' THEN 1
        ELSE rate_limits.attempts + 1
      END,
      window_started_at = CASE
        WHEN rate_limits.window_started_at < now() - interval '15 minutes' THEN now()
        ELSE rate_limits.window_started_at
      END,
      blocked_until = CASE
        WHEN rate_limits.attempts >= 9 THEN now() + interval '15 minutes'
        ELSE rate_limits.blocked_until
      END
    RETURNING attempts, blocked_until
  `;
  const state = rows[0];
  if (state?.blocked_until && state.blocked_until > new Date()) {
    throw new ApiError(429, "RATE_LIMITED", "Too many sign-in attempts. Try again later.");
  }
}

export async function clearLoginRateLimit(key: string): Promise<void> {
  await db().delete(rateLimits).where(eq(rateLimits.key, key));
}

export async function login(email: string, password: string): Promise<{ token: string; context: AuthContext }> {
  const normalizedEmail = email.trim().toLowerCase();
  const rows = await db().select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  const user = rows[0];
  const valid = user?.status === "ACTIVE" && (await compare(password, user.passwordHash));
  if (!valid) throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");

  const token = randomBytes(32).toString("base64url");
  const [session] = await db()
    .insert(sessions)
    .values({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
    .returning({ id: sessions.id });
  if (!session) throw new ApiError(500, "SESSION_ERROR", "Could not create a session.");

  const membershipRows = await db()
    .select({ role: memberships.role, organizationId: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, user.id))
    .limit(1);
  const membership = membershipRows[0];
  if (!membership) throw new ApiError(403, "NO_ORGANIZATION", "No dealership membership is assigned.");

  return {
    token,
    context: {
      sessionId: session.id,
      user: { id: user.id, email: user.email, name: user.name },
      organization: { id: membership.organizationId, name: membership.name, slug: membership.slug },
      role: membership.role,
    },
  };
}

export async function logout(context: AuthContext): Promise<void> {
  await db().update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, context.sessionId));
}
