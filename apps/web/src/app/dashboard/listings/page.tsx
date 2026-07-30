import { requireDashboardSession } from '@/lib/session';
import { ListingsClient } from './ListingsClient';

export const dynamic = 'force-dynamic';

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireDashboardSession();
  const { status } = await searchParams;
  return <ListingsClient orgId={session.activeOrg.id} role={session.activeOrg.role} initialStatus={status} />;
}
