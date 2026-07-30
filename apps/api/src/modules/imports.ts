import { createFeedSchema, csvImportSchema } from "@openlot/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { AppContext } from "../app.js";
import { feedSources, syncRuns } from "../db/schema.js";
import { enqueueJob } from "../jobs/queue.js";
import { writeAudit } from "../lib/audit.js";
import { errors, parseOrThrow } from "../lib/errors.js";
import { normalizeCsvText, runInventorySync } from "../services/inventorySync.js";
import { requireMembership } from "../plugins/auth.js";

export function importRoutes(ctx: AppContext): FastifyPluginAsync {
  const { db } = ctx;

  return async (app) => {
    /** Synchronous CSV import: parse, normalize, upsert, return a full report. */
    app.post("/orgs/:orgId/imports/csv", async (request) => {
      const { orgId } = request.params as { orgId: string };
      const membership = await requireMembership(db, request, orgId, "MANAGER");
      const input = parseOrThrow(csvImportSchema, request.body);
      const normalized = normalizeCsvText(input.csv);
      if (normalized.length === 0) throw errors.unprocessable("CSV contained no data rows");
      const outcome = await runInventorySync(db, normalized, {
        orgId,
        source: "CSV",
        markMissingAsSold: input.markMissingAsSold,
        trigger: "CSV",
      });
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "inventory.import_csv",
        entityType: "sync_run",
        entityId: outcome.syncRunId,
        meta: {
          total: outcome.stats.total,
          created: outcome.stats.created,
          updated: outcome.stats.updated,
          markedSold: outcome.stats.markedSold,
        },
        ip: request.ip,
      });
      return outcome;
    });

    /* --------------------------- Feeds --------------------------- */

    app.post("/orgs/:orgId/feeds", async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const membership = await requireMembership(db, request, orgId, "MANAGER");
      const input = parseOrThrow(createFeedSchema, request.body);
      const url = new URL(input.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw errors.unprocessable("Feed URL must use http(s)");
      }
      const [feed] = await db
        .insert(feedSources)
        .values({
          orgId,
          name: input.name,
          type: input.type,
          url: input.url,
          intervalMinutes: input.intervalMinutes,
          markMissingAsSold: input.markMissingAsSold,
        })
        .returning();
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "feed.create",
        entityType: "feed_source",
        entityId: feed!.id,
        meta: { url: input.url, type: input.type },
        ip: request.ip,
      });
      return reply.status(201).send({ feed: feed! });
    });

    app.get("/orgs/:orgId/feeds", async (request) => {
      const { orgId } = request.params as { orgId: string };
      await requireMembership(db, request, orgId);
      const feeds = await db.select().from(feedSources).where(eq(feedSources.orgId, orgId));
      return { feeds };
    });

    app.patch("/orgs/:orgId/feeds/:feedId", async (request) => {
      const { orgId, feedId } = request.params as { orgId: string; feedId: string };
      const membership = await requireMembership(db, request, orgId, "MANAGER");
      const input = parseOrThrow(
        createFeedSchema.partial().extend({ active: createFeedSchema.shape.markMissingAsSold.optional() }),
        request.body,
      );
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const key of ["name", "type", "url", "intervalMinutes", "markMissingAsSold", "active"] as const) {
        if (input[key as keyof typeof input] !== undefined) patch[key] = input[key as keyof typeof input];
      }
      const [feed] = await db
        .update(feedSources)
        .set(patch)
        .where(and(eq(feedSources.orgId, orgId), eq(feedSources.id, feedId)))
        .returning();
      if (!feed) throw errors.notFound("Feed not found");
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "feed.update",
        entityType: "feed_source",
        entityId: feedId,
        meta: { fields: Object.keys(patch) },
        ip: request.ip,
      });
      return { feed };
    });

    app.delete("/orgs/:orgId/feeds/:feedId", async (request) => {
      const { orgId, feedId } = request.params as { orgId: string; feedId: string };
      const membership = await requireMembership(db, request, orgId, "MANAGER");
      const [removed] = await db
        .delete(feedSources)
        .where(and(eq(feedSources.orgId, orgId), eq(feedSources.id, feedId)))
        .returning();
      if (!removed) throw errors.notFound("Feed not found");
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "feed.delete",
        entityType: "feed_source",
        entityId: feedId,
        ip: request.ip,
      });
      return { ok: true };
    });

    /** Trigger a manual sync (queued; deduplicated per feed). */
    app.post("/orgs/:orgId/feeds/:feedId/sync", async (request, reply) => {
      const { orgId, feedId } = request.params as { orgId: string; feedId: string };
      const membership = await requireMembership(db, request, orgId, "MANAGER");
      const [feed] = await db
        .select()
        .from(feedSources)
        .where(and(eq(feedSources.orgId, orgId), eq(feedSources.id, feedId)))
        .limit(1);
      if (!feed) throw errors.notFound("Feed not found");
      const jobId = await enqueueJob(
        db,
        "feed_sync",
        { feedSourceId: feedId, trigger: "MANUAL" },
        { dedupeKey: `feed_sync:${feedId}` },
      );
      await writeAudit(db, {
        orgId,
        actorUserId: membership.user.sub,
        action: "feed.manual_sync",
        entityType: "feed_source",
        entityId: feedId,
        meta: { jobId },
        ip: request.ip,
      });
      return reply.status(202).send({ queued: jobId !== null, jobId });
    });

    /** Sync health: recent runs with stats/errors. */
    app.get("/orgs/:orgId/sync-runs", async (request) => {
      const { orgId } = request.params as { orgId: string };
      await requireMembership(db, request, orgId);
      const runs = await db
        .select()
        .from(syncRuns)
        .where(eq(syncRuns.orgId, orgId))
        .orderBy(desc(syncRuns.startedAt))
        .limit(50);
      return { runs };
    });
  };
}
