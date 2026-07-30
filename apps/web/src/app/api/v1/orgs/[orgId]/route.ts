import { prisma } from "@lotpilot/db";
import { z } from "zod";
import { audit, handler, json, parseBody, requireOrgRole } from "@/server/api";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  const { membership } = await requireOrgRole(req, orgId);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  return json({ organization: { ...org, role: membership.role } });
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  website: z.string().trim().url().nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  state: z.string().trim().max(40).nullable().optional(),
  zip: z.string().trim().max(16).nullable().optional(),
  settings: z
    .object({
      disclaimers: z.array(z.string().max(500)).max(10).optional(),
      soldDetectionThreshold: z.number().int().min(1).max(10).optional(),
      defaultTone: z.enum(["professional", "friendly", "energetic"]).optional(),
      defaultLocation: z.string().max(120).nullable().optional(),
    })
    .optional(),
});

export const PATCH = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  const { user } = await requireOrgRole(req, orgId, "MANAGER");
  const body = await parseBody(req, patchSchema);

  const current = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const mergedSettings = body.settings
    ? { ...(current.settings as Record<string, unknown>), ...body.settings }
    : undefined;

  const org = await prisma.organization.update({
    where: { id: orgId },
    data: {
      ...body,
      settings: mergedSettings ? JSON.parse(JSON.stringify(mergedSettings)) : undefined,
    },
  });
  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: "org.update",
    entityType: "organization",
    entityId: orgId,
    data: { fields: Object.keys(body) },
  });
  return json({ organization: org });
});
