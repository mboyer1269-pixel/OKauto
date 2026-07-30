"use client";

import {
  Activity,
  AlertTriangle,
  Bell,
  CarFront,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  LogOut,
  Menu,
  PackageCheck,
  RefreshCw,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Dashboard = {
  user: { name: string; email: string };
  organization: { name: string };
  role: string;
  vehicleCounts: Record<string, number>;
  listingCounts: Record<string, number>;
  sources: Array<{ id: string; name: string; status: string; lastSuccessAt: string | null; lastRunStatus: string | null }>;
  activity: Array<{ id: string; type: string; title: string; actorName: string | null; createdAt: string }>;
  team: Array<{ id: string; name: string; role: string; listings: number }>;
  alerts: Array<{ id: string; title: string; body: string; createdAt: string }>;
};

type Vehicle = {
  id: string;
  vin: string | null;
  stockNumber: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  priceCents: number;
  status: string;
  media: Array<{ url: string }>;
  updatedAt: string;
};

type Listing = {
  id: string;
  vehicleId: string;
  title: string;
  priceCents: number;
  status: string;
  assigneeName: string | null;
  updatedAt: string;
  externalUrl: string | null;
};

type Tab = "overview" | "inventory" | "listings" | "team";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "Request failed.");
  return body;
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function relative(date: string | null): string {
  if (!date) return "Never";
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function DashboardClient() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [summary, inventory, listingData] = await Promise.all([
        api<Dashboard>("/api/v1/dashboard"),
        api<{ data: Vehicle[] }>("/api/v1/vehicles?limit=100"),
        api<{ data: Listing[] }>("/api/v1/listings"),
      ]);
      setDashboard(summary);
      setVehicles(inventory.data);
      setListings(listingData.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the workspace.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleVehicles = useMemo(() => {
    const value = search.toLowerCase();
    return vehicles.filter((vehicle) =>
      [vehicle.vin, vehicle.stockNumber, vehicle.make, vehicle.model, vehicle.trim].some((field) => field?.toLowerCase().includes(value)),
    );
  }, [search, vehicles]);

  async function createDrafts(ids: string[]) {
    setBusy(true);
    setError("");
    try {
      for (const vehicleId of ids) {
        await api("/api/v1/listings", {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
          body: JSON.stringify({ vehicleId }),
        });
      }
      setSelected(new Set());
      setTab("listings");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Draft creation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function prepare(listingId: string) {
    setBusy(true);
    try {
      const result = await api<{ data: { handoffToken: string } }>(`/api/v1/listings/${listingId}/prepare`, { method: "POST" });
      await navigator.clipboard.writeText(result.data.handoffToken);
      setError("One-time preparation code copied. Open the DriveFlow extension to continue and review every field before publishing.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare the listing.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (!dashboard) {
    return <main className="loading-screen"><LoaderCircle className="spin" /><p>{error || "Loading your dealership…"}</p></main>;
  }

  const nav = [
    { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
    { id: "inventory" as const, label: "Inventory", icon: CarFront },
    { id: "listings" as const, label: "Listings", icon: ListChecks },
    { id: "team" as const, label: "Team", icon: Users },
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-brand"><span className="brand-mark small">D</span><span>DriveFlow</span><button className="icon-button close-nav" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X /></button></div>
        <div className="org-switcher"><span>{dashboard.organization.name}</span><small>{dashboard.role.toLowerCase()}</small></div>
        <nav aria-label="Primary navigation">
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); setMobileNav(false); }}>
              <Icon size={19} /> {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button><Settings size={19} /> Settings</button>
          <button onClick={() => void logout()}><LogOut size={19} /> Sign out</button>
          <div className="user-card"><span>{dashboard.user.name.slice(0, 1)}</span><div><strong>{dashboard.user.name}</strong><small>{dashboard.user.email}</small></div></div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></button>
          <div><p className="eyebrow">{dashboard.organization.name}</p><h1>{nav.find((item) => item.id === tab)?.label}</h1></div>
          <div className="topbar-actions">
            <button className="icon-button notification-button" aria-label={`${dashboard.alerts.length} unread notifications`}><Bell /><span>{dashboard.alerts.length}</span></button>
            <button className="button secondary" onClick={() => void load()}><RefreshCw size={17} /> Sync view</button>
          </div>
        </header>

        {error ? <div className={error.includes("copied") ? "notice success" : "notice error"} role="status"><AlertTriangle size={18} />{error}<button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div> : null}

        {tab === "overview" ? (
          <section aria-label="Dealership overview">
            <div className="stat-grid">
              <Stat label="Available inventory" value={dashboard.vehicleCounts.AVAILABLE ?? 0} note={`${dashboard.vehicleCounts.STALE ?? 0} need review`} icon={CarFront} tone="blue" />
              <Stat label="Published listings" value={dashboard.listingCounts.PUBLISHED ?? 0} note={`${dashboard.listingCounts.PREPARED ?? 0} prepared`} icon={PackageCheck} tone="green" />
              <Stat label="Removal required" value={dashboard.listingCounts.REMOVAL_REQUIRED ?? 0} note="Human confirmation required" icon={AlertTriangle} tone="orange" />
              <Stat label="Sold this cycle" value={dashboard.vehicleCounts.SOLD ?? 0} note="Feed-confirmed units" icon={CheckCircle2} tone="purple" />
            </div>
            <div className="overview-grid">
              <section className="panel">
                <div className="panel-heading"><div><p className="eyebrow">Operations</p><h2>Sync health</h2></div><button className="text-button" onClick={() => setTab("inventory")}>View inventory <ChevronRight size={16} /></button></div>
                {dashboard.sources.map((source) => (
                  <div className="health-row" key={source.id}><span className={`health-dot ${source.status.toLowerCase()}`} /><div><strong>{source.name}</strong><small>Last healthy sync {relative(source.lastSuccessAt)}</small></div><Status value={source.status} /></div>
                ))}
              </section>
              <section className="panel">
                <div className="panel-heading"><div><p className="eyebrow">Attention</p><h2>Action queue</h2></div></div>
                {dashboard.alerts.length ? dashboard.alerts.slice(0, 4).map((alert) => (
                  <div className="alert-row" key={alert.id}><span><AlertTriangle size={17} /></span><div><strong>{alert.title}</strong><small>{alert.body}</small></div><time>{relative(alert.createdAt)}</time></div>
                )) : <Empty icon={CheckCircle2} title="All caught up" text="There are no unread inventory actions." />}
              </section>
              <section className="panel wide-panel">
                <div className="panel-heading"><div><p className="eyebrow">Accountability</p><h2>Recent listing activity</h2></div></div>
                <div className="activity-list">
                  {dashboard.activity.length ? dashboard.activity.map((item) => (
                    <div className="activity-row" key={item.id}><span><Activity size={16} /></span><div><strong>{item.actorName ?? "System"} · {item.type.toLowerCase().replaceAll("_", " ")}</strong><small>{item.title}</small></div><time>{relative(item.createdAt)}</time></div>
                  )) : <Empty icon={Activity} title="No listing activity yet" text="Create a draft from an available vehicle to begin." />}
                </div>
              </section>
            </div>
          </section>
        ) : null}

        {tab === "inventory" ? (
          <section className="panel table-panel">
            <div className="panel-heading inventory-tools">
              <div><p className="eyebrow">Vehicle source of truth</p><h2>{visibleVehicles.length} units</h2></div>
              <div className="tool-row"><label className="search-box"><Search size={17} /><span className="sr-only">Search inventory</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="VIN, stock, make, model" /></label>
              <button className="button primary" disabled={!selected.size || busy} onClick={() => void createDrafts([...selected])}>{busy ? <LoaderCircle className="spin" size={17} /> : <ClipboardCheck size={17} />} Create {selected.size || ""} draft{selected.size === 1 ? "" : "s"}</button></div>
            </div>
            <div className="table-scroll"><table><thead><tr><th><span className="sr-only">Select</span></th><th>Vehicle</th><th>Stock / VIN</th><th>Mileage</th><th>Price</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>{visibleVehicles.map((vehicle) => <tr key={vehicle.id}>
              <td><input aria-label={`Select ${vehicle.year} ${vehicle.make} ${vehicle.model}`} type="checkbox" checked={selected.has(vehicle.id)} disabled={vehicle.status !== "AVAILABLE"} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(vehicle.id)) next.delete(vehicle.id); else next.add(vehicle.id); return next; })} /></td>
              <td><div className="vehicle-cell">{vehicle.media[0] ? <img src={vehicle.media[0].url} alt="" /> : <span><CarFront /></span>}<div><strong>{vehicle.year} {vehicle.make} {vehicle.model}</strong><small>{vehicle.trim || "Base trim"}</small></div></div></td>
              <td><strong>{vehicle.stockNumber || "—"}</strong><small className="mono">{vehicle.vin || "No VIN"}</small></td>
              <td>{vehicle.mileage?.toLocaleString() ?? "—"}</td><td><strong>{money(vehicle.priceCents)}</strong></td><td><Status value={vehicle.status} /></td><td>{relative(vehicle.updatedAt)}</td>
            </tr>)}</tbody></table></div>
          </section>
        ) : null}

        {tab === "listings" ? (
          <section className="panel table-panel">
            <div className="panel-heading"><div><p className="eyebrow">Human-confirmed workflow</p><h2>Listing history</h2></div><button className="button primary" onClick={() => setTab("inventory")}><CarFront size={17} /> Choose inventory</button></div>
            <div className="policy-banner"><ShieldCheckIcon /> DriveFlow prepares fields and photos. You review and publish in Marketplace; it never submits for you.</div>
            <div className="table-scroll"><table><thead><tr><th>Vehicle</th><th>Owner</th><th>Price</th><th>Status</th><th>Updated</th><th><span className="sr-only">Action</span></th></tr></thead>
            <tbody>{listings.map((listing) => <tr key={listing.id}><td><strong>{listing.title}</strong><small className="mono">{listing.id.slice(0, 8)}</small></td><td>{listing.assigneeName || "Unassigned"}</td><td>{money(listing.priceCents)}</td><td><Status value={listing.status} /></td><td>{relative(listing.updatedAt)}</td><td>{["DRAFT", "PREPARED"].includes(listing.status) ? <button className="button secondary compact" disabled={busy} onClick={() => void prepare(listing.id)}>Open assistant <ChevronRight size={15} /></button> : listing.externalUrl ? <a className="text-button" href={listing.externalUrl} target="_blank" rel="noreferrer">View listing</a> : "—"}</td></tr>)}</tbody></table></div>
            {!listings.length ? <Empty icon={ListChecks} title="No drafts yet" text="Choose available inventory to create accurate, duplicate-safe drafts." /> : null}
          </section>
        ) : null}

        {tab === "team" ? (
          <section>
            <div className="team-grid">{dashboard.team.map((member) => <article className="team-card" key={member.id}><span className="avatar">{member.name.slice(0, 1)}</span><div><h2>{member.name}</h2><p>{member.role.toLowerCase()}</p></div><strong>{member.listings}<small> listings</small></strong></article>)}</div>
            <section className="panel team-note"><Users /><div><h2>Clear accountability, useful context</h2><p>Listing totals reflect recorded drafts and confirmations—not inferred Facebook actions. Owner and manager audit access is retained separately.</p></div></section>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function Stat({ label, value, note, icon: Icon, tone }: { label: string; value: number; note: string; icon: typeof CarFront; tone: string }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`}><Icon size={21} /></span><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></article>;
}

function Status({ value }: { value: string }) {
  return <span className={`status status-${value.toLowerCase()}`}>{value.toLowerCase().replaceAll("_", " ")}</span>;
}

function Empty({ icon: Icon, title, text }: { icon: typeof Activity; title: string; text: string }) {
  return <div className="empty"><Icon /><strong>{title}</strong><p>{text}</p></div>;
}

function ShieldCheckIcon() {
  return <span className="shield-check"><CheckCircle2 size={18} /></span>;
}
