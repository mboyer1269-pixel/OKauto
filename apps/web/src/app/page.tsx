import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="hero-landing">
      <header>
        <div className="brand">
          OK<span>auto</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link className="btn secondary" href="/login">
            Sign in
          </Link>
          <Link className="btn" href="/register">
            Start free
          </Link>
        </div>
      </header>
      <div className="hero-copy">
        <div className="brand">
          OK<span>auto</span>
        </div>
        <h1>List inventory where buyers already are.</h1>
        <p>
          Sync dealership inventory, generate compliant descriptions, and assist Marketplace posting
          with a human in the loop — plus sold alerts and salesperson analytics.
        </p>
        <div className="hero-actions">
          <Link className="btn" href="/register">
            Create dealership
          </Link>
          <Link className="btn secondary" href="/login">
            Demo login
          </Link>
        </div>
      </div>
    </div>
  );
}
