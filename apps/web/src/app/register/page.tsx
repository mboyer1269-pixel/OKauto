"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        organizationName: form.get("organizationName"),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Registration failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="container" style={{ maxWidth: 520, padding: "4rem 1rem" }}>
      <Link href="/" className="brand" style={{ fontWeight: 700, fontSize: "1.4rem" }}>
        OKauto
      </Link>
      <h1>Create your dealership</h1>
      <p className="muted">Owners get full admin access. Invite your team after setup.</p>
      <form className="panel" style={{ marginTop: "1.5rem" }} onSubmit={onSubmit}>
        <div className="field">
          <label className="label" htmlFor="organizationName">
            Dealership name
          </label>
          <input className="input" id="organizationName" name="organizationName" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input className="input" id="name" name="name" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="email">
            Work email
          </label>
          <input className="input" id="email" name="email" type="email" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">
            Password (min 10)
          </label>
          <input className="input" id="password" name="password" type="password" minLength={10} required />
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="btn" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>
    </main>
  );
}
