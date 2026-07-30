import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "@okauto/db";
import {
  AcceptInviteSchema,
  LoginSchema,
  RegisterSchema,
  slugify,
} from "@okauto/shared";
import {
  hashToken,
  parseTtlToMs,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/auth.js";
import { writeAudit } from "../services/audit.js";
import { authenticate } from "../plugins/auth.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/v1/auth/register", async (request, reply) => {
    const body = RegisterSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) {
      return reply.code(409).send({ error: "Email already registered", code: "EMAIL_EXISTS" });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    let slug = slugify(body.organizationName);
    const slugTaken = await prisma.organization.findUnique({ where: { slug } });
    if (slugTaken) slug = `${slug}-${Date.now().toString(36)}`;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: body.email.toLowerCase(),
          name: body.name,
          passwordHash,
        },
      });
      const org = await tx.organization.create({
        data: {
          name: body.organizationName,
          slug,
          settings: { onboardingComplete: false },
        },
      });
      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: "owner",
          status: "active",
        },
      });
      return { user, org };
    });

    await writeAudit({
      organizationId: result.org.id,
      actorId: result.user.id,
      action: "auth.register",
      entity: "organization",
      entityId: result.org.id,
      ip: request.ip,
    });

    const accessToken = signAccessToken(app.env, {
      sub: result.user.id,
      email: result.user.email,
    });
    const refresh = signRefreshToken(app.env, result.user.id);
    await prisma.refreshToken.create({
      data: {
        userId: result.user.id,
        tokenHash: hashToken(refresh.token),
        expiresAt: new Date(Date.now() + parseTtlToMs(app.env.JWT_REFRESH_TTL)),
      },
    });

    return reply.code(201).send({
      accessToken,
      refreshToken: refresh.token,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      organization: {
        id: result.org.id,
        name: result.org.name,
        slug: result.org.slug,
      },
    });
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const body = LoginSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: "Invalid credentials", code: "INVALID_CREDENTIALS" });
    }

    const memberships = await prisma.membership.findMany({
      where: { userId: user.id, status: "active" },
      include: { organization: true },
    });

    const accessToken = signAccessToken(app.env, {
      sub: user.id,
      email: user.email,
    });
    const refresh = signRefreshToken(app.env, user.id);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refresh.token),
        expiresAt: new Date(Date.now() + parseTtlToMs(app.env.JWT_REFRESH_TTL)),
      },
    });

    await writeAudit({
      actorId: user.id,
      action: "auth.login",
      entity: "user",
      entityId: user.id,
      ip: request.ip,
    });

    return {
      accessToken,
      refreshToken: refresh.token,
      user: { id: user.id, email: user.email, name: user.name },
      memberships: memberships.map((m) => ({
        id: m.id,
        role: m.role,
        organization: {
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
        },
      })),
    };
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
    const body = (request.body ?? {}) as { refreshToken?: string };
    if (!body.refreshToken) {
      return reply.code(400).send({ error: "refreshToken required" });
    }
    try {
      const claims = verifyRefreshToken(app.env, body.refreshToken);
      const stored = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(body.refreshToken) },
      });
      if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
        return reply.code(401).send({ error: "Invalid refresh token" });
      }
      const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.sub } });
      await prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      const accessToken = signAccessToken(app.env, {
        sub: user.id,
        email: user.email,
      });
      const refresh = signRefreshToken(app.env, user.id);
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(refresh.token),
          expiresAt: new Date(Date.now() + parseTtlToMs(app.env.JWT_REFRESH_TTL)),
        },
      });
      return { accessToken, refreshToken: refresh.token };
    } catch {
      return reply.code(401).send({ error: "Invalid refresh token" });
    }
  });

  app.post("/v1/auth/logout", { preHandler: authenticate }, async (request) => {
    const body = (request.body ?? {}) as { refreshToken?: string };
    if (body.refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(body.refreshToken), userId: request.user!.id },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  });

  app.get("/v1/me", { preHandler: authenticate }, async (request) => {
    const memberships = await prisma.membership.findMany({
      where: { userId: request.user!.id, status: "active" },
      include: { organization: true },
    });
    return {
      user: request.user,
      memberships: memberships.map((m) => ({
        id: m.id,
        role: m.role,
        organization: {
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
          settings: m.organization.settings,
        },
      })),
    };
  });

  app.post("/v1/auth/accept-invite", async (request, reply) => {
    const body = AcceptInviteSchema.parse(request.body);
    const invite = await prisma.invite.findUnique({ where: { token: body.token } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      return reply.code(400).send({ error: "Invalid or expired invite", code: "INVALID_INVITE" });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      let u = await tx.user.findUnique({ where: { email: invite.email.toLowerCase() } });
      if (!u) {
        u = await tx.user.create({
          data: {
            email: invite.email.toLowerCase(),
            name: body.name,
            passwordHash,
          },
        });
      } else {
        await tx.user.update({
          where: { id: u.id },
          data: { passwordHash, name: body.name },
        });
      }
      await tx.membership.upsert({
        where: {
          userId_organizationId: {
            userId: u.id,
            organizationId: invite.organizationId,
          },
        },
        update: { role: invite.role, status: "active" },
        create: {
          userId: u.id,
          organizationId: invite.organizationId,
          role: invite.role,
          status: "active",
        },
      });
      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return u;
    });

    await writeAudit({
      organizationId: invite.organizationId,
      actorId: user.id,
      action: "invite.accepted",
      entity: "invite",
      entityId: invite.id,
    });

    const accessToken = signAccessToken(app.env, {
      sub: user.id,
      email: user.email,
    });
    const refresh = signRefreshToken(app.env, user.id);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refresh.token),
        expiresAt: new Date(Date.now() + parseTtlToMs(app.env.JWT_REFRESH_TTL)),
      },
    });

    return {
      accessToken,
      refreshToken: refresh.token,
      user: { id: user.id, email: user.email, name: user.name },
      organizationId: invite.organizationId,
    };
  });
}
