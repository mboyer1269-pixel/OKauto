import { prisma } from "@lotpilot/db";
import { handler, json, pageParams, requireOrgRole } from "@/server/api";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  await requireOrgRole(req, orgId, "MANAGER");
  const url = new URL(req.url);
  const { page, pageSize, skip, take } = pageParams(url, 50);
  const action = url.searchParams.get("action")?.trim();

  const where = {
    organizationId: orgId,
    ...(action ? { action: { contains: action } } : {}),
  };
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  return json({ logs, page, pageSize, total });
});
