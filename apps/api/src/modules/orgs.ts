import { createOrgSchema, inviteSchema, updateMemberSchema } from "@openlot/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AppContext } from "../app.js";
import { invites, orgMemberships, organizations, users } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { errors, parseOrThrow } from "../lib/errors.js";
import { generateInviteToken } from "../lib/tokens.js";
import { requireMembership, requireUser } from "../plugins/auth.js";

const orgSettingsSchema = z.object({
  descriptionTone: z.enum(["PROFESSIONAL", "FRIENDLY", "ENTHUSIASTIC"]).optional(),
  includeDisclaimer: z.boolean().optional(),
  staleListingDays: z.number().int().min(1).max(60).optional(),
});

const updateOrgSchema = createOrgSchema.partial().extend({ settings: orgSettingsSchema.optional() });

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "dealership";
}

export function orgRoutes(ctx: AppContext): FastifyPluginAsync {
  const { db } = ctx;

  return async (app) => {
    /** Create a dealership; the creator becomes OWNER. */
    app.post("/orgs", async (request, reply) => {
      const user = requireUser(request);
      const input = parseOrThrow(createOrgSchema, request.body);
      let slug = slugify(input.name);
      const [taken] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
      if (taken) slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
      const [org] = await db
        .insert(organizations)
        .values({
          name: input.name,
          slug,
          phone: input.phone ?? null,
          website: input.website || null,
          addressLine: input.addressLine ?? null,
          city: input.city ?? null,
          region: input.region ?? null,
          postalCode: input.postalCode ?? null,
          country: input.country,
        })
        .returning();
      await db.insert(orgMemberships).values({ orgId: org!.id, userId: user.sub, role: "OWNER" });
      await writeAudit(db, {
        orgId: org!.id,
        actorUserId: user.sub,
        action: "org.create",
        entityType: "organization",
        entityId: org!.id,
        ip: request.ip,
      });
      return reply.status(201).send({ org: org!, role: "OWNER" });
    });

    app.get("/orgs/:orgId", async (request) => {
      const { orgId } = request.params as { orgId: string };
      const membership = await requireMembership(db, request, orgId);
      const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
      if (!org) throw errors.notFound("Organization not found");
      return { org, role: membership.role };
    });

    app.patch("/orgs/:orgId", async (request) => {
      const { orgId } = request.params as { orgId: string };
      const membership = await requireMembership(db, request, orgId, "MANAGER");
      const input = parseOrThrow(updateOrgSchema, request.body);
      const [current] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
      if (!current) throw errors.notFound("Organization not found");
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const key of ["name", "phone", "website", "addressLine", "city", "region", "postalCode", "country"] as const) {
        if (input[key] !== undefined) patch[key] = input[key] === "" ? null : input[key];
      }
      if (input.settings) {
        patch.settings = { ...(current.settings as Record<string, unknown>), ...input.settings };
      }
      const [org] = await db.update(organizations).set(patch).where(eq(organizations.id, orgId)).returning();
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "org.update",
        entityType: "organization",
        entityId: orgId,
        meta: { fields: Object.keys(patch) },
        ip: request.ip,
      });
      return { org: org! };
    });

    /* ------------------------- Members ------------------------- */

    app.get("/orgs/:orgId/members", async (request) => {
      const { orgId } = request.params as { orgId: string };
      await requireMembership(db, request, orgId);
      const members = await db
        .select({
          userId: users.id,
          name: users.name,
          email: users.email,
          role: orgMemberships.role,
          joinedAt: orgMemberships.createdAt,
        })
        .from(orgMemberships)
        .innerJoin(users, eq(orgMemberships.userId, users.id))
        .where(eq(orgMemberships.orgId, orgId));
      return { members };
    });

    app.patch("/orgs/:orgId/members/:userId", async (request) => {
      const { orgId, userId } = request.params as { orgId: string; userId: string };
      const membership = await requireMembership(db, request, orgId, "OWNER");
      const input = parseOrThrow(updateMemberSchema, request.body);
      if (userId === membership.user.sub && input.role !== "OWNER") {
        const owners = await db
          .select({ id: orgMemberships.id })
          .from(orgMemberships)
          .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.role, "OWNER")));
        if (owners.length <= 1) throw errors.conflict("An organization must retain at least one owner");
      }
      const [updated] = await db
        .update(orgMemberships)
        .set({ role: input.role })
        .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, userId)))
        .returning();
      if (!updated) throw errors.notFound("Member not found");
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "member.role_change",
        entityType: "membership",
        entityId: updated.id,
        meta: { targetUserId: userId, role: input.role },
        ip: request.ip,
      });
      return { member: updated };
    });

    app.delete("/orgs/:orgId/members/:userId", async (request) => {
      const { orgId, userId } = request.params as { orgId: string; userId: string };
      const membership = await requireMembership(db, request, orgId, "OWNER");
      if (userId === membership.user.sub) {
        throw errors.conflict("Owners cannot remove themselves; transfer ownership first");
      }
      const [removed] = await db
        .delete(orgMemberships)
        .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, userId)))
        .returning();
      if (!removed) throw errors.notFound("Member not found");
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "member.remove",
        entityType: "membership",
        entityId: removed.id,
        meta: { targetUserId: userId },
        ip: request.ip,
      });
      return { ok: true };
    });

    /* ------------------------- Invites ------------------------- */

    app.post("/orgs/:orgId/invites", async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const membership = await requireMembership(db, request, orgId, "MANAGER");
      const input = parseOrThrow(inviteSchema, request.body);
      if (input.role === "OWNER" && membership.role !== "OWNER") {
        throw errors.forbidden("Only owners can invite new owners");
      }
      const email = input.email.toLowerCase();
      const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existingUser) {
        const [existingMember] = await db
          .select({ id: orgMemberships.id })
          .from(orgMemberships)
          .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, existingUser.id)))
          .limit(1);
        if (existingMember) throw errors.conflict("This user is already a member");
      }
      const token = generateInviteToken();
      const [invite] = await db
        .insert(invites)
        .values({
          orgId,
          email,
          role: input.role,
          token,
          invitedByUserId: membership.user.sub,
          expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        })
        .returning();
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "invite.create",
        entityType: "invite",
        entityId: invite!.id,
        meta: { email, role: input.role },
        ip: request.ip,
      });
      // In production an email is sent; the token is returned so the dashboard
      // can present a copyable invite link (and for automated testing).
      return reply.status(201).send({ invite: invite! });
    });

    app.get("/orgs/:orgId/invites", async (request) => {
      const { orgId } = request.params as { orgId: string };
      await requireMembership(db, request, orgId, "MANAGER");
      const rows = await db.select().from(invites).where(eq(invites.orgId, orgId));
      return { invites: rows };
    });

    app.delete("/orgs/:orgId/invites/:inviteId", async (request) => {
      const { orgId, inviteId } = request.params as { orgId: string; inviteId: string };
      const membership = await requireMembership(db, request, orgId, "MANAGER");
      const [removed] = await db
        .delete(invites)
        .where(and(eq(invites.orgId, orgId), eq(invites.id, inviteId)))
        .returning();
      if (!removed) throw errors.notFound("Invite not found");
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "invite.revoke",
        entityType: "invite",
        entityId: inviteId,
        ip: request.ip,
      });
      return { ok: true };
    });
  };
}
