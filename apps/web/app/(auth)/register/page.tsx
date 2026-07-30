"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { VERTICALS } from "@okauto/shared";
import { humanize } from "@/lib/format";
import { Button, Card, Field, Input, Select } from "@/components/ui";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", orgName: "", vertical: "AUTOMOTIVE" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as { error?: { message: string; details?: { message: string }[] } };
      if (!res.ok) {
        const detail = json.error?.details?.[0]?.message;
        throw new Error(detail ?? json.error?.message ?? "Registration failed");
      }
      // Registration sets the refresh cookie; bounce through login state.
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="mb-4 text-base font-bold">Create your dealership</h2>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Dealership name">
          <Input required value={form.orgName} onChange={update("orgName")} placeholder="Summit Auto Group" />
        </Field>
        <Field label="Vertical">
          <Select value={form.vertical} onChange={update("vertical")}>
            {VERTICALS.map((v) => (
              <option key={v} value={v}>
                {humanize(v)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Your name">
          <Input required value={form.name} onChange={update("name")} placeholder="Alex Rivera" />
        </Field>
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={form.email} onChange={update("email")} />
        </Field>
        <Field label="Password" hint="At least 10 characters.">
          <Input
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={form.password}
            onChange={update("password")}
          />
        </Field>
        {error ? (
          <p role="alert" className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Creating…" : "Create organization"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-ink-400">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-400 hover:text-brand-300">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
