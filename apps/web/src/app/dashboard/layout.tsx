import Link from "next/link";
import { requireSession } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            OK
          </span>
          <span>ListingOps</span>
        </div>
        <nav className="nav">
          <Link href="/dashboard" aria-current="page">
            Dashboard
          </Link>
          <a href="#inventory">Inventory</a>
          <a href="#alerts">Alerts</a>
          <a href="#sync-health">Sync health</a>
          <form action="/api/auth/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Dealership command center</p>
            <h1>Inventory listing operations</h1>
          </div>
          <div className="card" style={{ padding: "12px 16px" }}>
            <strong>{session.name}</strong>
            <div className="muted">{session.roles.join(", ")}</div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
