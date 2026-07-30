"use client";

import { useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Card, Field, Input } from "@/components/ui";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/invites/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, name, password }),
      });
      const json = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(json.error?.message ?? "Could not accept invite");
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invite");
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="mb-2 text-base font-bold">Join your team</h2>
      <p className="mb-4 text-sm text-ink-400">Set your name and password to accept the invitation.</p>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Your name">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Password" hint="At least 10 characters.">
          <Input
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? (
          <p role="alert" className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Joining…" : "Accept invite"}
        </Button>
      </form>
    </Card>
  );
}
