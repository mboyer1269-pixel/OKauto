import { requireDashboardSession } from '@/lib/session';
import { InventoryClient } from './InventoryClient';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const session = await requireDashboardSession();
  return <InventoryClient orgId={session.activeOrg.id} role={session.activeOrg.role} />;
}
