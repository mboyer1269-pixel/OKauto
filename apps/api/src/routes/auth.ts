import type { FastifyInstance } from 'fastify';
import { loginSchema, registerSchema } from '@okauto/shared';
import { prisma } from '../db.js';
import { writeAudit } from '../lib/audit.js';
import { authenticate } from '../lib/auth.js';
import {
  hashPassword,
  parseDurationMs,
  randomToken,
  sha256,
  signAccessToken,
  slugify,
  verifyPassword,
} from '../lib/crypto.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/v1/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) {
      return reply
        .code(409)
        .send({ error: { code: 'email_taken', message: 'Email already registered' } });
    }

    const passwordHash = await hashPassword(body.password);
    let slug = slugify(body.organizationName);
    const slugTaken = await prisma.organization.findUnique({ where: { slug } });
    if (slugTaken) slug = `${slug}-${randomToken(3)}`;

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: body.organizationName, slug },
      });
      const dealership = await tx.dealership.create({
        data: {
          organizationId: org.id,
          name: body.dealershipName ?? body.organizationName,
        },
      });
      const user = await tx.user.create({
        data: {
          email: body.email.toLowerCase(),
          passwordHash,
          firstName: body.firstName,
          lastName: body.lastName,
        },
      });
      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          dealershipId: dealership.id,
          role: 'owner',
        },
      });
      return { org, dealership, user };
    });

    const accessToken = signAccessToken(request.env, {
      sub: result.user.id,
      email: result.user.email,
    });
    const refresh = randomToken(48);
    await prisma.refreshToken.create({
      data: {
        userId: result.user.id,
        tokenHash: sha256(refresh),
        expiresAt: new Date(Date.now() + parseDurationMs(request.env.JWT_REFRESH_TTL)),
        userAgent: request.headers['user-agent']?.slice(0, 300),
        ip: request.ip,
      },
    });

    await writeAudit({
      organizationId: result.org.id,
      actorId: result.user.id,
      action: 'auth.register',
      entityType: 'organization',
      entityId: result.org.id,
      ip: request.ip,
    });

    return {
      accessToken,
      refreshToken: refresh,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
      organization: { id: result.org.id, name: result.org.name, slug: result.org.slug },
      dealership: { id: result.dealership.id, name: result.dealership.name },
    };
  });

  app.post('/v1/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      return reply
        .code(401)
        .send({ error: { code: 'invalid_credentials', message: 'Invalid email or password' } });
    }
    if (!user.isActive) {
      return reply.code(403).send({ error: { code: 'inactive', message: 'Account inactive' } });
    }

    const accessToken = signAccessToken(request.env, { sub: user.id, email: user.email });
    const refresh = randomToken(48);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refresh),
        expiresAt: new Date(Date.now() + parseDurationMs(request.env.JWT_REFRESH_TTL)),
        userAgent: request.headers['user-agent']?.slice(0, 300),
        ip: request.ip,
      },
    });

    await writeAudit({
      actorId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      ip: request.ip,
    });

    return {
      accessToken,
      refreshToken: refresh,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  });

  app.post('/v1/auth/refresh', async (request, reply) => {
    const body = (request.body ?? {}) as { refreshToken?: string };
    if (!body.refreshToken) {
      return reply.code(400).send({ error: { code: 'bad_request', message: 'refreshToken required' } });
    }
    const tokenHash = sha256(body.refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return reply.code(401).send({ error: { code: 'invalid_refresh', message: 'Invalid refresh token' } });
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });
    const accessToken = signAccessToken(request.env, { sub: user.id, email: user.email });
    const refresh = randomToken(48);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refresh),
        expiresAt: new Date(Date.now() + parseDurationMs(request.env.JWT_REFRESH_TTL)),
        userAgent: request.headers['user-agent']?.slice(0, 300),
        ip: request.ip,
      },
    });

    return { accessToken, refreshToken: refresh };
  });

  app.post('/v1/auth/logout', { preHandler: [authenticate] }, async (request) => {
    const body = (request.body ?? {}) as { refreshToken?: string };
    if (body.refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: sha256(body.refreshToken), userId: request.user!.id },
        data: { revokedAt: new Date() },
      });
    }
    await writeAudit({
      actorId: request.user!.id,
      action: 'auth.logout',
      entityType: 'user',
      entityId: request.user!.id,
      ip: request.ip,
    });
    return { ok: true };
  });

  app.get('/v1/me', { preHandler: [authenticate] }, async (request) => {
    const memberships = await prisma.membership.findMany({
      where: { userId: request.user!.id },
      include: {
        organization: true,
        dealership: true,
      },
    });
    return {
      user: request.user,
      memberships: memberships.map((m) => ({
        id: m.id,
        role: m.role,
        organization: { id: m.organization.id, name: m.organization.name, slug: m.organization.slug },
        dealership: m.dealership
          ? { id: m.dealership.id, name: m.dealership.name }
          : null,
      })),
    };
  });

  app.post('/v1/auth/extension-token', { preHandler: [authenticate] }, async (request, reply) => {
    const membership = request.user!.memberships[0];
    if (!membership) {
      return reply.code(400).send({ error: { code: 'no_org', message: 'No organization membership' } });
    }
    const raw = `oka_${randomToken(32)}`;
    const token = await prisma.apiToken.create({
      data: {
        userId: request.user!.id,
        organizationId: membership.organizationId,
        name: 'Chrome Extension',
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });
    await writeAudit({
      organizationId: membership.organizationId,
      actorId: request.user!.id,
      action: 'auth.extension_token_created',
      entityType: 'api_token',
      entityId: token.id,
      ip: request.ip,
    });
    return { token: raw, id: token.id, expiresAt: token.expiresAt };
  });
}
