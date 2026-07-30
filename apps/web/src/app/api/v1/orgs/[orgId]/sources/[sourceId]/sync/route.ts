import { prisma, fetchFeedRecords, runSourceSync } from "@lotpilot/db";
import { audit, badRequest, handler, json, notFound, requireOrgRole, tooManyRequests } from "@/server/api";
import { rateLimit } from "@/server/ratelimit";

type Ctx = { params: Promise<{ orgId: string; sourceId: string }> };

/** Manual "sync now" trigger — runs inline so the caller gets the outcome. */
export const POST = handler<Ctx>(async (req, ctx) => {
  const { orgId, sourceId } = await ctx.params;
  const { user } = await requireOrgRole(req, orgId, "MANAGER");
  if (!rateLimit(`sync:${sourceId}`, 4, 60_000)) throw tooManyRequests("Sync already triggered recently");

  const source = await prisma.inventorySource.findFirst({ where: { id: sourceId, organizationId: orgId } });
  if (!source) throw notFound("Source not found");
  if (source.type === "CSV_UPLOAD" || source.type === "MANUAL") {
    throw badRequest("This source type has no feed URL; upload a CSV instead");
  }

  let outcome;
  try {
    const records = await fetchFeedRecords(source);
    outcome = await runSourceSync(prisma, source, records, { trigger: "manual" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.inventorySource.update({
      where: { id: sourceId },
      data: { status: "ERROR", lastError: message },
    });
    throw badRequest(`Feed fetch failed: ${message}`);
  }

  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: "source.sync_manual",
    entityType: "sync_run",
    entityId: outcome.runId,
    data: { status: outcome.status },
  });
  return json({ runId: outcome.runId, status: outcome.status, stats: outcome.stats, error: outcome.error });
});
