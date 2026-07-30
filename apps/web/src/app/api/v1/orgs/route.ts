import { prisma } from '@okauto/db';
import { z } from 'zod';
import { handler, jsonOk, parseJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { audit, clientIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createOrgSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category: z
    .enum([
      'AUTOMOTIVE', 'RV_TRAILER', 'MARINE_POWERSPORTS', 'MOBILE_HOME',
      'REAL_ESTATE', 'FARM_EQUIPMENT', 'FURNITURE', 'OTHER',
    ])
    .default('AUTOMOTIVE'),
});

function slugify(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'org'
  );
}

export const GET = handler(async (req) => {
  const user = await requireUser(req);
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { organization: true },
    orderBy: { createdAt: 'asc' },
  });
  return jsonOk(
    memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      category: m.organization.category,
      role: m.role,
    })),
  );
});

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const input = await parseJson(req, createOrgSchema);

  const base = slugify(input.name);
  let slug = base;
  for (let i = 1; await prisma.organization.findUnique({ where: { slug } }); i += 1) {
    slug = `${base}-${i}`;
  }

  const org = await prisma.organization.create({
    data: {
      name: input.name,
      slug,
      category: input.category,
      memberships: { create: { userId: user.id, role: 'OWNER' } },
    },
  });
  await audit({ organizationId: org.id, actorId: user.id, action: 'org.create', ip: clientIp(req) });
  return jsonOk({ id: org.id, name: org.name, slug: org.slug, category: org.category }, { status: 201 });
});
