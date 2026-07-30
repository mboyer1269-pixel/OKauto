import { desc, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { AppContext } from "../app.js";
import { jobs, orgMemberships, organizations, users, vehicles } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { errors } from "../lib/errors.js";
import { queueDepth } from "../jobs/queue.js";
import { requirePlatformAdmin } from "../plugins/auth.js";

/** Platform administration: cross-tenant visibility and queue operations. */
export function adminRoutes(ctx: AppContext): FastifyPluginAsync {
  const { db } = ctx;

  return async (app) => {
    app.get("/admin/orgs", async (request) => {
      requirePlatformAdmin(request);
      const orgs = await db
        .select({
          org: organizations,
          memberCount: sql<number>`(select count(*)::int from ${orgMemberships} where ${orgMemberships.orgId} = ${organizations.id})`,
          vehicleCount: sql<number>`(select count(*)::int from ${vehicles} where ${vehicles.orgId} = ${organizations.id})`,
        })
        .from(organizations)
        .orderBy(desc(organizations.createdAt))
        .limit(200);
      return { orgs };
    });

    app.get("/admin/users", async (request) => {
      requirePlatformAdmin(request);
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          isPlatformAdmin: users.isPlatformAdmin,
          disabledAt: users.disabledAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(500);
      return { users: rows };
    });

    app.post("/admin/users/:userId/disable", async (request) => {
      const admin = requirePlatformAdmin(request);
      const { userId } = request.params as { userId: string };
      if (userId === admin.sub) throw errors.conflict("You cannot disable your own account");
      const [updated] = await db
        .update(users)
        .set({ disabledAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      if (!updated) throw errors.notFound("User not found");
      await writeAudit(db, {
        actorUserId: admin.sub,
        action: "admin.user_disable",
        entityType: "user",
        entityId: userId,
        ip: request.ip,
      });
      return { ok: true };
    });

    app.post("/admin/users/:userId/enable", async (request) => {
      const admin = requirePlatformAdmin(request);
      const { userId } = request.params as { userId: string };
      const [updated] = await db
        .update(users)
        .set({ disabledAt: null, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      if (!updated) throw errors.notFound("User not found");
      await writeAudit(db, {
        actorUserId: admin.sub,
        action: "admin.user_enable",
        entityType: "user",
        entityId: userId,
        ip: request.ip,
      });
      return { ok: true };
    });

    /** Queue observability + dead-letter retry. */
    app.get("/admin/jobs", async (request) => {
      requirePlatformAdmin(request);
      const depth = await queueDepth(db);
      const recent = await db.select().from(jobs).orderBy(desc(jobs.updatedAt)).limit(100);
      return { depth, recent };
    });

    app.post("/admin/jobs/:jobId/retry", async (request) => {
      const admin = requirePlatformAdmin(request);
      const { jobId } = request.params as { jobId: string };
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
      if (!job) throw errors.notFound("Job not found");
      if (job.status !== "DEAD" && job.status !== "FAILED") {
        throw errors.conflict(`Only dead/failed jobs can be retried (status: ${job.status})`);
      }
      await db
        .update(jobs)
        .set({ status: "PENDING", attempts: 0, runAt: new Date(), lastError: null, updatedAt: new Date() })
        .where(eq(jobs.id, jobId));
      await writeAudit(db, {
        actorUserId: admin.sub,
        action: "admin.job_retry",
        entityType: "job",
        entityId: jobId,
        ip: request.ip,
      });
      return { ok: true };
    });
  };
}
