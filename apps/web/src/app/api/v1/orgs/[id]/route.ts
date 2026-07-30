import { prisma } from '@okauto/db';
import { z } from 'zod';
import { handler, jsonOk, parseJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { assertCan, requireOrgContext } from '@/lib/context';
import { audit, clientIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  category: z
    .enum([
      'AUTOMOTIVE', 'RV_TRAILER', 'MARINE_POWERSPORTS', 'MOBILE_HOME',
      'REAL_ESTATE', 'FARM_EQUIPMENT', 'FURNITURE', 'OTHER',
    ])
    .optional(),
});

export const GET = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const orgCtx = await requireOrgContext(user, id);
  assertCan(orgCtx, 'org:read');
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { vehicles: true, listings: true, memberships: true } } },
  });
  return jsonOk({
    id: org.id,
    name: org.name,
    slug: org.slug,
    category: org.category,
    role: orgCtx.role,
    counts: org._count,
  });
});

export const PATCH = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const orgCtx = await requireOrgContext(user, id);
  assertCan(orgCtx, 'org:update');
  const input = await parseJson(req, patchSchema);
  const org = await prisma.organization.update({ where: { id }, data: input });
  await audit({ organizationId: id, actorId: user.id, action: 'org.update', metadata: input, ip: clientIp(req) });
  return jsonOk({ id: org.id, name: org.name, slug: org.slug, category: org.category });
});
