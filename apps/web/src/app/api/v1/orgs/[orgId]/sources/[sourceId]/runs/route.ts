import { prisma } from "@lotpilot/db";
import { handler, json, notFound, pageParams, requireOrgRole } from "@/server/api";

type Ctx = { params: Promise<{ orgId: string; sourceId: string }> };

export const GET = handler<Ctx>(async (req, ctx) => {
  const { orgId, sourceId } = await ctx.params;
  await requireOrgRole(req, orgId);
  const source = await prisma.inventorySource.findFirst({ where: { id: sourceId, organizationId: orgId } });
  if (!source) throw notFound("Source not found");
  const { page, pageSize, skip, take } = pageParams(new URL(req.url));
  const [total, runs] = await Promise.all([
    prisma.syncRun.count({ where: { sourceId } }),
    prisma.syncRun.findMany({ where: { sourceId }, orderBy: { startedAt: "desc" }, skip, take }),
  ]);
  return json({ runs, page, pageSize, total });
});
