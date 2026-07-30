import { requireDashboardSession } from '@/lib/session';
import { Topbar } from '@/components/Topbar';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireDashboardSession();
  return (
    <div>
      <Topbar orgName={session.activeOrg.name} userName={session.user.name} />
      <main className="container page">{children}</main>
    </div>
  );
}
