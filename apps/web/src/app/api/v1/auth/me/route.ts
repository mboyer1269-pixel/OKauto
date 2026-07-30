import { prisma } from '@okauto/db';
import { handler, jsonOk } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  const user = await requireUser(req);
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { organization: { select: { id: true, name: true, slug: true, category: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return jsonOk({
    user: { id: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin },
    memberships: memberships.map((m) => ({
      organization: m.organization,
      role: m.role,
    })),
  });
});
