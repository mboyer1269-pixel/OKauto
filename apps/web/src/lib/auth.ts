/** Session auth: JWT (HS256) stored in an httpOnly cookie, plus extension bearer tokens. */
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '@okauto/db';
import { hashToken } from '@okauto/shared/password';
import { env } from './env';
import { httpErrors } from './http';

const COOKIE_NAME = 'okauto_session';
const secret = new TextEncoder().encode(env.authSecret);

export interface SessionPayload {
  sub: string; // user id
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${env.sessionTtl}s`)
    .setSubject(payload.sub)
    .sign(secret);
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
    maxAge: env.sessionTtl,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function readSessionFromCookie(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      sub: String(payload.sub),
      email: String(payload.email),
      name: String(payload.name),
      isSuperAdmin: Boolean(payload.isSuperAdmin),
    };
  } catch {
    return null;
  }
}

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  via: 'cookie' | 'token';
}

/**
 * Resolve the current user from either the session cookie (dashboard) or an
 * `Authorization: Bearer <apiToken>` header (extension). Throws 401 if neither is valid.
 */
export async function requireUser(req: Request): Promise<AuthedUser> {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const raw = auth.slice(7).trim();
    const tokenHash = await hashToken(raw);
    const token = await prisma.apiToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!token || token.revokedAt) throw httpErrors.unauthorized('Invalid API token');
    await prisma.apiToken.update({
      where: { id: token.id },
      data: { lastUsedAt: new Date() },
    });
    return {
      id: token.user.id,
      email: token.user.email,
      name: token.user.name,
      isSuperAdmin: token.user.isSuperAdmin,
      via: 'token',
    };
  }

  const session = await readSessionFromCookie();
  if (!session) throw httpErrors.unauthorized();
  return {
    id: session.sub,
    email: session.email,
    name: session.name,
    isSuperAdmin: session.isSuperAdmin,
    via: 'cookie',
  };
}

/** For server components: returns the user or null (no throw). */
export async function getCurrentUser(): Promise<SessionPayload | null> {
  return readSessionFromCookie();
}
