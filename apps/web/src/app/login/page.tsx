"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Login failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="container" style={{ maxWidth: 480, padding: "4rem 1rem" }}>
      <Link href="/" className="brand" style={{ fontWeight: 700, fontSize: "1.4rem" }}>
        OKauto
      </Link>
      <h1 style={{ marginBottom: "0.35rem" }}>Sign in</h1>
      <p className="muted">Demo: owner@demo.okauto.local / DemoPass123!</p>
      <form className="panel" style={{ marginTop: "1.5rem" }} onSubmit={onSubmit}>
        <div className="field">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input className="input" id="email" name="email" type="email" required defaultValue="owner@demo.okauto.local" />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">
            Password
          </label>
          <input className="input" id="password" name="password" type="password" required defaultValue="DemoPass123!" />
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="btn" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="muted" style={{ marginTop: "1rem" }}>
        New dealer? <Link href="/register">Create an organization</Link>
      </p>
    </main>
  );
}
