import { prisma } from '@okauto/db';
import { FACEBOOK_MARKETPLACE_ADAPTER } from '@okauto/shared';
import { handler, jsonOk } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Returns the caller's orgs and the current Marketplace adapter for the content script. */
export const GET = handler(async (req) => {
  const user = await requireUser(req);
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });
  return jsonOk({
    user: { id: user.id, name: user.name, email: user.email },
    organizations: memberships.map((m) => ({ ...m.organization, role: m.role })),
    adapter: FACEBOOK_MARKETPLACE_ADAPTER,
  });
});
