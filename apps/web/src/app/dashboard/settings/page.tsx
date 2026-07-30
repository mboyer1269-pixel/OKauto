import { requireDashboardSession } from '@/lib/session';
import { SettingsClient } from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireDashboardSession();
  return <SettingsClient orgName={session.activeOrg.name} orgId={session.activeOrg.id} />;
}
