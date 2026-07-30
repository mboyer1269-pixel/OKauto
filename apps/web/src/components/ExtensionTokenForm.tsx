"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ExtensionTokenForm() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setToken(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/v1/extension/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: form.get("label") || "Chrome extension" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to create token");
      return;
    }
    setToken(data.token);
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Create extension token</h2>
      <div className="field">
        <label className="label" htmlFor="label">
          Label
        </label>
        <input className="input" id="label" name="label" defaultValue="Chrome extension" />
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      {token ? (
        <p className="success-text">
          Copy now: <code>{token}</code>
        </p>
      ) : null}
      <button className="btn" type="submit">
        Generate token
      </button>
    </form>
  );
}
