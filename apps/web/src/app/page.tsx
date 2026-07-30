import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const FEATURES = [
  ['Import & normalize inventory', 'CSV/JSON import with VIN decode, dedup, and clean normalization.'],
  ['AI-assisted descriptions', 'Compliant, policy-linted listing copy in one click — with an offline fallback.'],
  ['Human-in-the-loop posting', 'The extension pre-fills the Marketplace composer; a person reviews and posts.'],
  ['Sold & price-change alerts', 'Automatic takedown flags and notifications so stale listings disappear.'],
  ['Salesperson analytics', 'Per-rep KPIs, leaderboards, listing history, and time-to-list.'],
  ['Resilient adapters', 'Versioned, self-healing selectors and full pipeline observability.'],
];

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  return (
    <div>
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            OK<span>auto</span>
          </div>
          <div className="row">
            <Link className="btn" href="/login">
              Log in
            </Link>
            <Link className="btn btn-primary" href="/register">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <span className="pill">Facebook Marketplace listing platform for dealers</span>
          <h1>List more inventory in less time.</h1>
          <p>
            OKauto helps dealerships post, manage, and track vehicle listings on Facebook
            Marketplace — with AI-assisted descriptions, human-in-the-loop posting, sold-vehicle
            alerts, and per-salesperson analytics. Policy-compliant by design.
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link className="btn btn-primary" href="/register">
              Create your dealership
            </Link>
            <Link className="btn" href="/login">
              I already have an account
            </Link>
          </div>
        </section>

        <section className="grid grid-3" style={{ paddingBottom: 60 }}>
          {FEATURES.map(([title, body]) => (
            <div className="card" key={title}>
              <h3>{title}</h3>
              <p className="muted small">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
