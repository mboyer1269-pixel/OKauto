"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import { Card, CardHeader } from "@/components/ui";

interface SettingsFields {
  name: string;
  website: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  disclaimers: string;
  soldDetectionThreshold: number;
  defaultTone: string;
  defaultLocation: string;
}

export function OrgSettingsForm({ orgId, initial }: { orgId: string; initial: SettingsFields }) {
  const router = useRouter();
  const [fields, setFields] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SettingsFields>(key: K, value: SettingsFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/api/v1/orgs/${orgId}`, {
        method: "PATCH",
        json: {
          name: fields.name,
          website: fields.website || null,
          phone: fields.phone || null,
          address: fields.address || null,
          city: fields.city || null,
          state: fields.state || null,
          zip: fields.zip || null,
          settings: {
            disclaimers: fields.disclaimers
              .split("\n")
              .map((d) => d.trim())
              .filter((d) => d !== ""),
            soldDetectionThreshold: Number(fields.soldDetectionThreshold),
            defaultTone: fields.defaultTone,
            defaultLocation: fields.defaultLocation || null,
          },
        },
      });
      setMessage("Settings saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Dealership profile & listing defaults" />
      <form onSubmit={save} className="space-y-4 p-5">
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="s-name">
              Dealership name
            </label>
            <input className="input" id="s-name" value={fields.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="s-website">
              Website
            </label>
            <input className="input" id="s-website" type="url" value={fields.website} onChange={(e) => set("website", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="s-phone">
              Phone
            </label>
            <input className="input" id="s-phone" value={fields.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="s-location">
              Default listing location
            </label>
            <input
              className="input"
              id="s-location"
              placeholder="Columbus, OH"
              value={fields.defaultLocation}
              onChange={(e) => set("defaultLocation", e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="s-tone">
              Default description tone
            </label>
            <select className="input" id="s-tone" value={fields.defaultTone} onChange={(e) => set("defaultTone", e.target.value)}>
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="energetic">Energetic</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="s-threshold">
              Sold detection threshold (consecutive missing syncs)
            </label>
            <input
              className="input"
              id="s-threshold"
              type="number"
              min={1}
              max={10}
              value={fields.soldDetectionThreshold}
              onChange={(e) => set("soldDetectionThreshold", Number(e.target.value))}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="s-disclaimers">
            Listing disclaimers (one per line — appended to every generated description)
          </label>
          <textarea
            className="input min-h-20"
            id="s-disclaimers"
            value={fields.disclaimers}
            onChange={(e) => set("disclaimers", e.target.value)}
            placeholder="Price excludes tax, title, license, and documentation fee."
          />
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
    </Card>
  );
}
