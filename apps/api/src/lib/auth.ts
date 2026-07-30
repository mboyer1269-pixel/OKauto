import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@okauto/shared';
import { hasMinRole } from '@okauto/shared';
import { prisma } from '../db.js';
import { verifyAccessToken, sha256 } from './crypto.js';
import type { Env } from '../config.js';

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  memberships: Array<{
    id: string;
    organizationId: string;
    dealershipId: string | null;
    role: Role;
  }>;
};

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    env: Env;
  }
}

async function loadUser(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        select: { id: true, organizationId: true, dealershipId: true, role: true },
      },
    },
  });
  if (!user || !user.isActive) return null;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    memberships: user.memberships.map((m) => ({
      ...m,
      role: m.role as Role,
    })),
  };
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: { code: 'unauthorized', message: 'Missing bearer token' } });
  }
  const token = header.slice('Bearer '.length).trim();

  try {
    // Prefer JWT access tokens; also accept hashed API tokens
    try {
      const claims = verifyAccessToken(request.env, token);
      const user = await loadUser(claims.sub);
      if (!user) {
        return reply.code(401).send({ error: { code: 'unauthorized', message: 'User not found' } });
      }
      request.user = user;
      return;
    } catch {
      const tokenHash = sha256(token);
      const apiToken = await prisma.apiToken.findUnique({ where: { tokenHash } });
      if (!apiToken || apiToken.revokedAt || (apiToken.expiresAt && apiToken.expiresAt < new Date())) {
        return reply.code(401).send({ error: { code: 'unauthorized', message: 'Invalid token' } });
      }
      await prisma.apiToken.update({
        where: { id: apiToken.id },
        data: { lastUsedAt: new Date() },
      });
      const user = await loadUser(apiToken.userId);
      if (!user) {
        return reply.code(401).send({ error: { code: 'unauthorized', message: 'User not found' } });
      }
      request.user = user;
    }
  } catch {
    return reply.code(401).send({ error: { code: 'unauthorized', message: 'Invalid token' } });
  }
}

export function requireRole(minRole: Role) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({ error: { code: 'unauthorized', message: 'Not authenticated' } });
    }
    const best = request.user.memberships.reduce<Role | null>((acc, m) => {
      if (!acc) return m.role;
      return hasMinRole(m.role, acc) ? m.role : acc;
    }, null);
    if (!best || !hasMinRole(best, minRole)) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Insufficient role' } });
    }
  };
}

export function orgIdsFor(user: AuthUser): string[] {
  return [...new Set(user.memberships.map((m) => m.organizationId))];
}

export function roleInOrg(user: AuthUser, organizationId: string): Role | null {
  const memberships = user.memberships.filter((m) => m.organizationId === organizationId);
  if (!memberships.length) return null;
  return memberships.reduce((best, m) => (hasMinRole(m.role, best) ? m.role : best), memberships[0].role);
}
