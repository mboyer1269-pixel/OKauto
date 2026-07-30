import { requireDashboardSession } from '@/lib/session';
import { TeamClient } from './TeamClient';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const session = await requireDashboardSession();
  return <TeamClient orgId={session.activeOrg.id} role={session.activeOrg.role} selfId={session.user.id} />;
}
