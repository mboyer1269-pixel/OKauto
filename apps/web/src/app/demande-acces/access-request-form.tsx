"use client";

import { useState } from "react";
import Link from "next/link";
import { accessRequestCopy, accessRequestHrefs } from "@/content/access-request";

const emptyForm = {
  name: "",
  dealership: "",
  email: "",
  phone: "",
  message: "",
};

export function AccessRequestForm() {
  const [form, setForm] = useState(emptyForm);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/v1/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          dealership: form.dealership,
          email: form.email,
          phone: form.phone,
          message: form.message,
          consent,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(
          data.error ?? "La demande n’a pas pu être envoyée. Réessayez.",
        );
        return;
      }
      setSubmitted(true);
    } catch {
      setError("La demande n’a pas pu être envoyée. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <p role="status" className="rounded-xl bg-signal/15 p-4 text-signal">
        {accessRequestCopy.submitted}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 rounded-2xl p-6">
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      <div>
        <label htmlFor="access-name" className="mb-1 block text-sm font-medium">
          {accessRequestCopy.fields.name}
        </label>
        <input
          id="access-name"
          name="name"
          className="input"
          autoComplete="name"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          required
          maxLength={100}
        />
      </div>
      <div>
        <label
          htmlFor="access-dealership"
          className="mb-1 block text-sm font-medium"
        >
          {accessRequestCopy.fields.dealership}
        </label>
        <input
          id="access-dealership"
          name="dealership"
          className="input"
          autoComplete="organization"
          value={form.dealership}
          onChange={(event) =>
            setForm({ ...form, dealership: event.target.value })
          }
          required
          maxLength={200}
        />
      </div>
      <div>
        <label htmlFor="access-email" className="mb-1 block text-sm font-medium">
          {accessRequestCopy.fields.email}
        </label>
        <input
          id="access-email"
          name="email"
          type="email"
          className="input"
          autoComplete="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          required
        />
      </div>
      <div>
        <label htmlFor="access-phone" className="mb-1 block text-sm font-medium">
          {accessRequestCopy.fields.phone}{" "}
          <span className="font-normal text-muted-foreground">
            ({accessRequestCopy.fields.phoneOptional})
          </span>
        </label>
        <input
          id="access-phone"
          name="phone"
          type="tel"
          className="input"
          autoComplete="tel"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
          maxLength={40}
        />
      </div>
      <div>
        <label
          htmlFor="access-message"
          className="mb-1 block text-sm font-medium"
        >
          {accessRequestCopy.fields.message}
        </label>
        <textarea
          id="access-message"
          name="message"
          className="input min-h-28"
          value={form.message}
          onChange={(event) =>
            setForm({ ...form, message: event.target.value })
          }
          required
          maxLength={2000}
        />
      </div>
      <label className="flex items-start gap-3 text-sm leading-6">
        <input
          id="access-consent"
          name="consent"
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 rounded border-input"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          required
        />
        <span>
          {accessRequestCopy.consent}{" "}
          <Link
            href={accessRequestHrefs.privacy}
            className="font-semibold text-primary hover:underline"
          >
            {accessRequestCopy.privacy}
          </Link>
        </span>
      </label>
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? "Envoi…" : accessRequestCopy.submit}
      </button>
    </form>
  );
}
