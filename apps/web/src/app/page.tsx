import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <header className="container" style={{ padding: "1.25rem 0", position: "relative", zIndex: 2 }}>
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }} aria-label="Primary">
          <span className="brand" style={{ fontWeight: 700, fontSize: "1.15rem" }}>
            OKauto
          </span>
          <div className="cta-row">
            <Link className="btn btn-secondary" href="/login">
              Sign in
            </Link>
            <Link className="btn" href="/register">
              Start free
            </Link>
          </div>
        </nav>
      </header>

      <section className="hero" aria-label="OKauto hero">
        <div className="hero-media" aria-hidden="true" />
        <div className="container hero-content">
          <p className="brand-mark rise">OKauto</p>
          <h1 className="rise-delay">List inventory on Marketplace in minutes — with humans in control.</h1>
          <p className="rise-delay">
            Sync your lot, generate compliant descriptions, assist Facebook Marketplace posting via Chrome
            extension, and alert your team when units sell.
          </p>
          <div className="cta-row rise-delay">
            <Link className="btn" href="/register">
              Create dealership
            </Link>
            <Link className="btn btn-secondary" href="/login">
              Demo login
            </Link>
          </div>
        </div>
      </section>

      <section className="container" style={{ padding: "4rem 0 5rem" }}>
        <h2 style={{ marginTop: 0 }}>Built for dealer workflows</h2>
        <p className="muted" style={{ maxWidth: "52ch" }}>
          Clean-room alternative focused on speed, sync health, duplicate prevention, and policy-safe assistive
          listing — never CAPTCHA bypass or unattended publishing.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
            marginTop: "1.5rem",
          }}
        >
          {[
            ["Inventory sync", "CSV/feed import with content hashing and duplicate guards."],
            ["Assistive extension", "Resilient Marketplace form fill. You confirm and publish."],
            ["Team analytics", "Track listings by salesperson and surface removal alerts."],
            ["Sold detection", "When inventory flips to sold, notify listers instantly."],
          ].map(([title, body]) => (
            <article key={title} className="panel">
              <h3 style={{ marginTop: 0 }}>{title}</h3>
              <p className="muted" style={{ marginBottom: 0 }}>
                {body}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
