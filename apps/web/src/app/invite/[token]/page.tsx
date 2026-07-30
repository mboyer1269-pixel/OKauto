"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/v1/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: params.token,
        name: form.get("name"),
        password: form.get("password"),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Invite failed");
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
      <h1>Join dealership</h1>
      <p className="muted">Create your account from an invite link.</p>
      <form className="panel" onSubmit={onSubmit}>
        <div className="field">
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input className="input" id="name" name="name" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">
            Password (min 10)
          </label>
          <input className="input" id="password" name="password" type="password" minLength={10} required />
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="btn" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Joining…" : "Accept invite"}
        </button>
      </form>
    </main>
  );
}
