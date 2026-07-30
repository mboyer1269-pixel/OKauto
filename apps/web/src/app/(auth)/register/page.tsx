"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/v1/auth/register", {
        method: "POST",
        json: {
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        },
      });
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-lg font-bold">Create your account</h1>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div>
        <label className="label" htmlFor="name">
          Full name
        </label>
        <input className="input" id="name" name="name" autoComplete="name" required />
      </div>
      <div>
        <label className="label" htmlFor="email">
          Work email
        </label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="mt-1 text-xs text-slate-500">
          At least 10 characters with a letter and a number.
        </p>
      </div>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </button>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link className="font-semibold text-brand-600 hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </form>
  );
}
