"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function InviteForm() {
  const router = useRouter();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInviteUrl(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/v1/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        role: form.get("role"),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Invite failed");
      return;
    }
    setInviteUrl(data.inviteUrl);
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Invite teammate</h2>
      <div className="field">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input className="input" id="email" name="email" type="email" required />
      </div>
      <div className="field">
        <label className="label" htmlFor="role">
          Role
        </label>
        <select className="select" id="role" name="role" defaultValue="SALESPERSON">
          <option value="ADMIN">ADMIN</option>
          <option value="MANAGER">MANAGER</option>
          <option value="SALESPERSON">SALESPERSON</option>
        </select>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      {inviteUrl ? (
        <p className="success-text">
          Invite link: <code>{inviteUrl}</code>
        </p>
      ) : null}
      <button className="btn" type="submit">
        Send invite
      </button>
    </form>
  );
}
