import { sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { AppContext } from "../app.js";
import { queueDepth } from "../jobs/queue.js";

export function healthRoutes(ctx: AppContext): FastifyPluginAsync {
  return async (app) => {
    app.get("/healthz", async () => ({ status: "ok", uptimeSeconds: Math.round(process.uptime()) }));

    app.get("/readyz", async (_request, reply) => {
      try {
        await ctx.db.execute(sql`select 1`);
        const queue = await queueDepth(ctx.db);
        return { status: "ready", queue };
      } catch (err) {
        return reply.status(503).send({
          status: "unavailable",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  };
}
