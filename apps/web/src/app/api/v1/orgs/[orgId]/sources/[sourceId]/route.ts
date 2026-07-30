import { fieldMappingSchema } from "@lotpilot/core";
import { prisma } from "@lotpilot/db";
import { z } from "zod";
import { audit, handler, json, notFound, parseBody, requireOrgRole } from "@/server/api";

type Ctx = { params: Promise<{ orgId: string; sourceId: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  url: z.string().trim().url().optional(),
  scheduleMinutes: z
    .number()
    .int()
    .min(15)
    .max(24 * 60)
    .optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  fieldMapping: fieldMappingSchema.partial().optional(),
});

export const PATCH = handler<Ctx>(async (req, ctx) => {
  const { orgId, sourceId } = await ctx.params;
  const { user } = await requireOrgRole(req, orgId, "MANAGER");
  const body = await parseBody(req, patchSchema);

  const source = await prisma.inventorySource.findFirst({
    where: { id: sourceId, organizationId: orgId },
  });
  if (!source) throw notFound("Source not found");

  const updated = await prisma.inventorySource.update({
    where: { id: sourceId },
    data: {
      ...body,
      fieldMapping: body.fieldMapping ? JSON.parse(JSON.stringify(body.fieldMapping)) : undefined,
      lastError: body.status === "ACTIVE" ? null : undefined,
    },
  });
  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: "source.update",
    entityType: "source",
    entityId: sourceId,
    data: { fields: Object.keys(body) },
  });
  return json({ source: updated });
});

export const DELETE = handler<Ctx>(async (req, ctx) => {
  const { orgId, sourceId } = await ctx.params;
  const { user } = await requireOrgRole(req, orgId, "MANAGER");
  const source = await prisma.inventorySource.findFirst({
    where: { id: sourceId, organizationId: orgId },
  });
  if (!source) throw notFound("Source not found");
  await prisma.inventorySource.delete({ where: { id: sourceId } });
  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: "source.delete",
    entityType: "source",
    entityId: sourceId,
    data: { name: source.name },
  });
  return json({ ok: true });
});
