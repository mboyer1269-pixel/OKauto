import { fieldMappingSchema } from "@lotpilot/core";
import { prisma } from "@lotpilot/db";
import { z } from "zod";
import { audit, handler, json, parseBody, requireOrgRole } from "@/server/api";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  await requireOrgRole(req, orgId);
  const sources = await prisma.inventorySource.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { vehicles: true } },
      syncRuns: { orderBy: { startedAt: "desc" }, take: 1 },
    },
  });
  return json({ sources });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["FEED_JSON", "FEED_CSV"]),
  url: z.string().trim().url(),
  scheduleMinutes: z.number().int().min(15).max(24 * 60).default(60),
  fieldMapping: fieldMappingSchema.partial().optional(),
});

export const POST = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  const { user } = await requireOrgRole(req, orgId, "MANAGER");
  const body = await parseBody(req, createSchema);

  const source = await prisma.inventorySource.create({
    data: {
      organizationId: orgId,
      name: body.name,
      type: body.type,
      url: body.url,
      scheduleMinutes: body.scheduleMinutes,
      fieldMapping: JSON.parse(JSON.stringify(body.fieldMapping ?? {})),
      nextSyncAt: new Date(), // due immediately; the worker picks it up
    },
  });
  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: "source.create",
    entityType: "source",
    entityId: source.id,
    data: { type: body.type, url: body.url },
  });
  return json({ source }, { status: 201 });
});
