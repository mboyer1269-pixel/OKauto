"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";

export default function OnboardingPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const val = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
    };
    try {
      const data = await api<{ organization: { id: string } }>("/api/v1/orgs", {
        method: "POST",
        json: {
          name: val("name"),
          website: val("website"),
          phone: val("phone"),
          city: val("city"),
          state: val("state"),
        },
      });
      router.push(`/o/${data.organization.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-lg">
        <div className="card p-6">
          <h1 className="text-lg font-bold">Set up your dealership</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create your dealership workspace. You can invite your team and connect your inventory
            feed right after.
          </p>
          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            {error ? (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <div>
              <label className="label" htmlFor="name">
                Dealership name *
              </label>
              <input className="input" id="name" name="name" required minLength={2} />
            </div>
            <div>
              <label className="label" htmlFor="website">
                Website
              </label>
              <input
                className="input"
                id="website"
                name="website"
                type="url"
                placeholder="https://"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="phone">
                  Phone
                </label>
                <input className="input" id="phone" name="phone" type="tel" />
              </div>
              <div>
                <label className="label" htmlFor="city">
                  City
                </label>
                <input className="input" id="city" name="city" />
              </div>
              <div>
                <label className="label" htmlFor="state">
                  State
                </label>
                <input className="input" id="state" name="state" maxLength={20} />
              </div>
            </div>
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "Creating…" : "Create dealership"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
