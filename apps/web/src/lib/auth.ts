import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { prisma, verifyPassword } from "@okauto/db";
import type { Role } from "@okauto/shared";

const SESSION_COOKIE = "okauto_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export interface SessionPrincipal {
  userId: string;
  organizationId: string;
  email: string;
  name: string;
  roles: Role[];
}

interface SignedSession {
  principal: SessionPrincipal;
  expiresAt: number;
}

function secret(): string {
  return process.env.NEXTAUTH_SECRET ?? "development-secret-change-me";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function encodeSession(session: SignedSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(value: string | undefined): SignedSession | null {
  if (!value) {
    return null;
  }

  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SignedSession;
  return decoded.expiresAt > Date.now() ? decoded : null;
}

export async function login(email: string, password: string): Promise<SessionPrincipal | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { memberships: true }
  });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return null;
  }

  return {
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    roles: user.memberships.map((membership) => membership.role as Role)
  };
}

export async function setSessionCookie(principal: SessionPrincipal) {
  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE,
    encodeSession({
      principal,
      expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000
    }),
    {
      httpOnly: true,
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    }
  );
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPrincipal | null> {
  const cookieStore = await cookies();
  return decodeSession(cookieStore.get(SESSION_COOKIE)?.value)?.principal ?? null;
}

export function getSessionFromRequest(request: NextRequest): SessionPrincipal | null {
  return decodeSession(request.cookies.get(SESSION_COOKIE)?.value)?.principal ?? null;
}

export async function requireSession(): Promise<SessionPrincipal> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export function hasAnyRole(principal: SessionPrincipal, allowed: Role[]): boolean {
  return principal.roles.some((role) => allowed.includes(role));
}
