import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-story" aria-labelledby="story-title">
        <p className="eyebrow light">Built for accountable selling</p>
        <h2 id="story-title">Move inventory without losing control.</h2>
        <ul>
          <li>One accurate source of vehicle truth</li>
          <li>Human-confirmed Marketplace assistance</li>
          <li>Immediate sold and price-change actions</li>
        </ul>
      </section>
      <LoginForm />
    </main>
  );
}
