import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { requirePageAuth } from "@/lib/auth";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/inventory", label: "Inventory" },
  { href: "/dashboard/listings", label: "Listings" },
  { href: "/dashboard/notifications", label: "Alerts" },
  { href: "/dashboard/team", label: "Team" },
  { href: "/dashboard/extension", label: "Extension" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePageAuth();
  if (!session) redirect("/login");

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Dashboard">
        <div>
          <div className="brand" style={{ fontWeight: 800, fontSize: "1.35rem" }}>
            OKauto
          </div>
          <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
            {session.org.name}
          </p>
          <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.8rem" }}>
            {session.user.name} · {session.membership.role}
          </p>
        </div>
        <nav aria-label="Dashboard sections">
          {LINKS.map((link) => (
            <Link key={link.href} className="nav-link" href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div style={{ marginTop: "1.5rem" }}>
          <LogoutButton />
        </div>
      </aside>
      <div className="main">{children}</div>
    </div>
  );
}
