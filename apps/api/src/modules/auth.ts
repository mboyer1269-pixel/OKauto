import { loginSchema, registerSchema } from "@openlot/shared";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import type { AppContext } from "../app.js";
import { invites, orgMemberships, organizations, refreshTokens, users } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { errors, parseOrThrow } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "../lib/tokens.js";
import { requireUser } from "../plugins/auth.js";

const REFRESH_COOKIE = "openlot_refresh";

const refreshBodySchema = z.object({ refreshToken: z.string().min(10).optional() }).optional();

const updateMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(10)
    .max(128)
    .regex(/[a-zA-Z]/)
    .regex(/[0-9]/)
    .optional(),
});

export function authRoutes(ctx: AppContext): FastifyPluginAsync {
  const { db, config } = ctx;

  async function issueTokens(user: typeof users.$inferSelect, client: string, reply: FastifyReply) {
    const accessToken = await signAccessToken(
      { sub: user.id, email: user.email, name: user.name, isPlatformAdmin: user.isPlatformAdmin },
      config.JWT_SECRET,
      config.ACCESS_TOKEN_TTL_SECONDS,
    );
    const { token: refreshToken, hash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await db.insert(refreshTokens).values({ userId: user.id, tokenHash: hash, client, expiresAt });
    reply.setCookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.COOKIE_SECURE ?? config.NODE_ENV === "production",
      path: "/api/v1/auth",
      maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
    });
    return { accessToken, refreshToken, accessTokenExpiresInSeconds: config.ACCESS_TOKEN_TTL_SECONDS };
  }

  async function membershipsFor(userId: string) {
    return db
      .select({
        orgId: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        role: orgMemberships.role,
      })
      .from(orgMemberships)
      .innerJoin(organizations, eq(orgMemberships.orgId, organizations.id))
      .where(eq(orgMemberships.userId, userId));
  }

  return async (app) => {
    app.post("/auth/register", { config: { rateLimit: { max: 20, timeWindow: 60_000 } } }, async (request, reply) => {
      const input = parseOrThrow(registerSchema, request.body);
      const email = input.email.toLowerCase();
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) throw errors.conflict("An account with this email already exists");
      const [user] = await db
        .insert(users)
        .values({ email, name: input.name, passwordHash: await hashPassword(input.password) })
        .returning();
      await writeAudit(db, {
        actorUserId: user!.id,
        action: "user.register",
        entityType: "user",
        entityId: user!.id,
        ip: request.ip,
      });
      const tokens = await issueTokens(user!, clientOf(request.headers["x-openlot-client"]), reply);
      return reply.status(201).send({
        user: publicUser(user!),
        orgs: [],
        ...tokens,
      });
    });

    app.post("/auth/login", { config: { rateLimit: { max: 15, timeWindow: 60_000 } } }, async (request, reply) => {
      const input = parseOrThrow(loginSchema, request.body);
      const email = input.email.toLowerCase();
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const passwordOk = user ? await verifyPassword(input.password, user.passwordHash) : false;
      if (!user || !passwordOk) throw errors.unauthorized("Invalid email or password");
      if (user.disabledAt) throw errors.forbidden("This account has been disabled");
      await writeAudit(db, {
        actorUserId: user.id,
        action: "user.login",
        entityType: "user",
        entityId: user.id,
        ip: request.ip,
      });
      const tokens = await issueTokens(user, clientOf(request.headers["x-openlot-client"]), reply);
      return { user: publicUser(user), orgs: await membershipsFor(user.id), ...tokens };
    });

    app.post("/auth/refresh", async (request, reply) => {
      const body = parseOrThrow(refreshBodySchema, request.body ?? undefined);
      const presented = body?.refreshToken ?? request.cookies[REFRESH_COOKIE];
      if (!presented) throw errors.unauthorized("Missing refresh token");
      const hash = hashRefreshToken(presented);
      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())))
        .limit(1);
      if (!row) throw errors.unauthorized("Invalid or expired refresh token");
      const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
      if (!user || user.disabledAt) throw errors.unauthorized("Account unavailable");
      // Rotate: revoke the presented token, issue a fresh pair.
      await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
      const tokens = await issueTokens(user, row.client, reply);
      return { user: publicUser(user), orgs: await membershipsFor(user.id), ...tokens };
    });

    app.post("/auth/logout", async (request, reply) => {
      const body = parseOrThrow(refreshBodySchema, request.body ?? undefined);
      const presented = body?.refreshToken ?? request.cookies[REFRESH_COOKIE];
      if (presented) {
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(refreshTokens.tokenHash, hashRefreshToken(presented)));
      }
      reply.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
      return { ok: true };
    });

    app.get("/auth/me", async (request) => {
      const claims = requireUser(request);
      const [user] = await db.select().from(users).where(eq(users.id, claims.sub)).limit(1);
      if (!user) throw errors.unauthorized();
      return { user: publicUser(user), orgs: await membershipsFor(user.id) };
    });

    app.patch("/auth/me", async (request) => {
      const claims = requireUser(request);
      const input = parseOrThrow(updateMeSchema, request.body);
      const [user] = await db.select().from(users).where(eq(users.id, claims.sub)).limit(1);
      if (!user) throw errors.unauthorized();
      const patch: Partial<typeof users.$inferInsert> = {};
      if (input.name) patch.name = input.name;
      if (input.newPassword) {
        if (!input.currentPassword || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
          throw errors.forbidden("Current password is incorrect");
        }
        patch.passwordHash = await hashPassword(input.newPassword);
        // Changing the password revokes all refresh tokens.
        await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, user.id));
      }
      if (Object.keys(patch).length === 0) return { user: publicUser(user) };
      patch.updatedAt = new Date();
      const [updated] = await db.update(users).set(patch).where(eq(users.id, user.id)).returning();
      await writeAudit(db, {
        actorUserId: user.id,
        action: "user.update",
        entityType: "user",
        entityId: user.id,
        ip: request.ip,
      });
      return { user: publicUser(updated!) };
    });

    /** Accept an invite (token from the invite email/link) as the current user. */
    app.post("/auth/invites/accept", async (request) => {
      const claims = requireUser(request);
      const input = parseOrThrow(z.object({ token: z.string().min(10) }), request.body);
      const [invite] = await db.select().from(invites).where(eq(invites.token, input.token)).limit(1);
      if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
        throw errors.notFound("Invite is invalid or has expired");
      }
      if (invite.email.toLowerCase() !== claims.email.toLowerCase()) {
        throw errors.forbidden("This invite was issued for a different email address");
      }
      const [existing] = await db
        .select({ id: orgMemberships.id })
        .from(orgMemberships)
        .where(and(eq(orgMemberships.orgId, invite.orgId), eq(orgMemberships.userId, claims.sub)))
        .limit(1);
      if (!existing) {
        await db.insert(orgMemberships).values({ orgId: invite.orgId, userId: claims.sub, role: invite.role });
      }
      await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
      await writeAudit(db, {
        orgId: invite.orgId,
        actorUserId: claims.sub,
        action: "invite.accept",
        entityType: "invite",
        entityId: invite.id,
        ip: request.ip,
      });
      return { orgs: await membershipsFor(claims.sub) };
    });
  };
}

function publicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isPlatformAdmin: user.isPlatformAdmin,
    createdAt: user.createdAt,
  };
}

function clientOf(header: unknown): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value === "extension" ? "extension" : "web";
}
