import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <header className="shell" style={{ padding: "1.25rem 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="display" style={{ fontSize: "1.75rem" }}>
          OKauto
        </div>
        <nav style={{ display: "flex", gap: "0.75rem" }}>
          <Link className="btn btn-ghost" href="/login">
            Sign in
          </Link>
          <Link className="btn btn-primary" href="/register">
            Start free
          </Link>
        </nav>
      </header>

      <section
        className="shell animate-rise"
        style={{
          minHeight: "78vh",
          display: "grid",
          alignContent: "end",
          padding: "2rem 0 3rem",
          backgroundImage:
            "linear-gradient(180deg, rgba(18,34,28,0.05), rgba(18,34,28,0.55)), url(https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=2000&q=80)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          color: "white",
          marginTop: "0.5rem",
        }}
      >
        <div style={{ padding: "2rem", maxWidth: "40rem" }}>
          <p className="display underline-sweep" style={{ fontSize: "clamp(2.8rem, 7vw, 5rem)", lineHeight: 0.95, margin: 0 }}>
            OKauto
          </p>
          <h1 style={{ fontSize: "clamp(1.2rem, 2.4vw, 1.6rem)", fontWeight: 500, margin: "1rem 0 0.6rem", maxWidth: "28rem" }}>
            List dealership inventory on Marketplace without the busywork.
          </h1>
          <p style={{ margin: "0 0 1.4rem", opacity: 0.92, maxWidth: "32rem" }}>
            Sync stock, draft compliant descriptions, assist posting in Chrome, and alert your team when units sell — with human confirmation at every publish step.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Link className="btn btn-primary" href="/register" style={{ background: "var(--lime)", color: "var(--ink)" }}>
              Create dealership
            </Link>
            <Link className="btn btn-ghost" href="/login" style={{ borderColor: "rgba(255,255,255,0.45)", color: "white" }}>
              Use demo login
            </Link>
          </div>
        </div>
      </section>

      <section className="shell animate-rise-delay" style={{ padding: "3.5rem 0", display: "grid", gap: "1.5rem" }}>
        <h2 className="display" style={{ fontSize: "2.4rem", margin: 0 }}>
          Built for the floor, not another dashboard maze.
        </h2>
        <p style={{ maxWidth: "40rem", color: "var(--ink-soft)", margin: 0 }}>
          Managers see who listed what. Salespeople get one-click drafts and extension assist. Sold vehicles trigger removal reminders so Marketplace stays accurate.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
          {[
            ["Inventory sync", "CSV import, feed URL sync, VIN normalize, duplicate prevention."],
            ["Human-in-the-loop", "Extension fills Marketplace fields. You confirm. No CAPTCHA bypass."],
            ["Team analytics", "Listings per salesperson, sync health, audit trail, sold alerts."],
          ].map(([title, copy]) => (
            <div key={title} className="panel" style={{ padding: "1.25rem" }}>
              <h3 style={{ margin: "0 0 0.5rem" }}>{title}</h3>
              <p style={{ margin: 0, color: "var(--ink-soft)" }}>{copy}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
