import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AppError,
  DEFAULT_TEMPLATE,
  REFRESH_TOKEN_TTL_SECONDS,
  acceptInviteSchema,
  loginSchema,
  registerSchema,
} from "@okauto/shared";
import type { User } from "@okauto/db";
import { hashPassword, verifyPassword } from "../../lib/passwords.js";
import { randomToken, sha256 } from "../../lib/tokens.js";
import { writeAudit } from "../../lib/audit.js";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "org";
}

async function uniqueSlug(app: FastifyInstance, base: string): Promise<string> {
  let candidate = base;
  for (let i = 2; ; i += 1) {
    const existing = await app.prisma.organization.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    candidate = `${base}-${i}`.slice(0, 48);
  }
}

function setRefreshCookie(app: FastifyInstance, reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(app.config.REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: app.config.COOKIE_SECURE,
    path: "/api/v1/auth",
    expires: expiresAt,
  });
}

async function issueSession(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  user: User,
  rotatedFromId?: string,
) {
  const accessToken = await reply.jwtSign({ sub: user.id }, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  const refreshPlaintext = randomToken(48);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  await app.prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshPlaintext),
      expiresAt,
      rotatedFromId: rotatedFromId ?? null,
      userAgent: request.headers["user-agent"] ?? null,
      ip: request.ip,
    },
  });
  setRefreshCookie(app, reply, refreshPlaintext, expiresAt);
  return { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isPlatformAdmin: user.isPlatformAdmin,
  };
}

export default async function authRoutes(app: FastifyInstance) {
  app.post(
    "/auth/register",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const input = registerSchema.parse(request.body);
      const existing = await app.prisma.user.findUnique({ where: { email: input.email } });
      if (existing) throw AppError.conflict("An account with this email already exists");

      const passwordHash = await hashPassword(input.password);
      const slug = await uniqueSlug(app, slugify(input.orgName));

      const { user, org } = await app.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: input.email, passwordHash, name: input.name },
        });
        const org = await tx.organization.create({
          data: {
            name: input.orgName,
            slug,
            vertical: input.vertical,
            memberships: { create: { userId: user.id, role: "ORG_OWNER" } },
            templates: { create: { name: "Default — professional", body: DEFAULT_TEMPLATE, isDefault: true } },
            sources: { create: { type: "MANUAL", name: "Manual entry" } },
          },
        });
        await writeAudit(tx, {
          orgId: org.id,
          actorType: "USER",
          actorUserId: user.id,
          action: "ORG_REGISTERED",
          entityType: "Organization",
          entityId: org.id,
          ip: request.ip,
        });
        return { user, org };
      });

      const session = await issueSession(app, request, reply, user);
      return reply.status(201).send({
        ...session,
        user: publicUser(user),
        org: { id: org.id, name: org.name, slug: org.slug, role: "ORG_OWNER" },
      });
    },
  );

  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const user = await app.prisma.user.findUnique({ where: { email: input.email } });
      // Constant-shape failure to avoid account enumeration.
      if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
        throw AppError.unauthorized("Invalid email or password");
      }
      if (user.status !== "ACTIVE") throw AppError.unauthorized("Account deactivated");

      const session = await issueSession(app, request, reply, user);
      const memberships = await app.prisma.membership.findMany({
        where: { userId: user.id, status: "ACTIVE" },
        include: { org: { select: { id: true, name: true, slug: true, vertical: true, onboarding: true, settings: true } } },
      });
      return {
        ...session,
        user: publicUser(user),
        memberships: memberships.map((m) => ({
          orgId: m.orgId,
          role: m.role,
          org: m.org,
        })),
      };
    },
  );

  app.post("/auth/refresh", async (request, reply) => {
    const token = request.cookies[app.config.REFRESH_COOKIE_NAME];
    if (!token) throw AppError.unauthorized("Missing refresh token");
    const existing = await app.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!existing) throw AppError.unauthorized("Invalid refresh token");

    if (existing.revokedAt) {
      // Refresh-token reuse: revoke the whole family.
      await app.prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await writeAudit(app.prisma, {
        actorType: "SYSTEM",
        actorUserId: existing.userId,
        action: "REFRESH_TOKEN_REUSE_DETECTED",
        entityType: "User",
        entityId: existing.userId,
        ip: request.ip,
      });
      throw AppError.unauthorized("Refresh token reuse detected; all sessions revoked");
    }
    if (existing.expiresAt < new Date()) throw AppError.unauthorized("Refresh token expired");
    if (existing.user.status !== "ACTIVE") throw AppError.unauthorized("Account deactivated");

    await app.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    const session = await issueSession(app, request, reply, existing.user, existing.id);
    return { ...session, user: publicUser(existing.user) };
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies[app.config.REFRESH_COOKIE_NAME];
    if (token) {
      await app.prisma.refreshToken.updateMany({
        where: { tokenHash: sha256(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    reply.clearCookie(app.config.REFRESH_COOKIE_NAME, { path: "/api/v1/auth" });
    return { ok: true };
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request) => {
    const auth = request.auth!;
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    const memberships = await app.prisma.membership.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      include: {
        org: { select: { id: true, name: true, slug: true, vertical: true, onboarding: true, settings: true, timezone: true } },
      },
    });
    return {
      user: publicUser(user),
      memberships: memberships.map((m) => ({ orgId: m.orgId, role: m.role, org: m.org })),
    };
  });

  app.post(
    "/auth/invites/accept",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const input = acceptInviteSchema.parse(request.body);
      const invite = await app.prisma.invite.findUnique({
        where: { tokenHash: sha256(input.token) },
        include: { org: true },
      });
      if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
        throw AppError.validation("Invite is invalid or expired");
      }
      const passwordHash = await hashPassword(input.password);
      const result = await app.prisma.$transaction(async (tx) => {
        const user = await tx.user.upsert({
          where: { email: invite.email },
          create: { email: invite.email, name: input.name, passwordHash },
          update: { passwordHash, name: input.name },
        });
        const membership = await tx.membership.upsert({
          where: { userId_orgId: { userId: user.id, orgId: invite.orgId } },
          create: { userId: user.id, orgId: invite.orgId, role: invite.role, status: "ACTIVE" },
          update: { role: invite.role, status: "ACTIVE" },
        });
        await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
        const leaders = await tx.membership.findMany({
          where: { orgId: invite.orgId, status: "ACTIVE", role: { in: ["ORG_OWNER", "ORG_MANAGER"] } },
          select: { userId: true },
        });
        for (const leader of leaders) {
          await tx.notification.create({
            data: {
              orgId: invite.orgId,
              userId: leader.userId,
              type: "MEMBER_JOINED",
              title: `${user.name} joined the team`,
              body: `${user.email} accepted an invite as ${invite.role}.`,
              data: { userId: user.id, role: invite.role },
            },
          });
        }
        await writeAudit(tx, {
          orgId: invite.orgId,
          actorType: "USER",
          actorUserId: user.id,
          action: "INVITE_ACCEPTED",
          entityType: "Membership",
          entityId: membership.id,
          ip: request.ip,
        });
        return { user };
      });
      const session = await issueSession(app, request, reply, result.user);
      return {
        ...session,
        user: publicUser(result.user),
        org: { id: invite.org.id, name: invite.org.name, slug: invite.org.slug, role: invite.role },
      };
    },
  );
}
