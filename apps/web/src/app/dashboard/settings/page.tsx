"use client";

import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Button, Card, ErrorNote, Field, PageHeader, Spinner, inputClass } from "@/components/ui";

interface Org {
  org: {
    id: string;
    name: string;
    phone: string | null;
    website: string | null;
    addressLine: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    settings: { descriptionTone?: string; includeDisclaimer?: boolean; staleListingDays?: number };
  };
}

export default function SettingsPage() {
  const { currentOrg } = useSession();
  const orgId = currentOrg?.orgId;
  const { data, error, loading, reload } = useApi<Org>(orgId ? `/api/v1/orgs/${orgId}` : null);

  const [form, setForm] = useState({
    name: "", phone: "", website: "", addressLine: "", city: "", region: "", postalCode: "",
    descriptionTone: "PROFESSIONAL", includeDisclaimer: true, staleListingDays: "7",
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const o = data.org;
    setForm({
      name: o.name,
      phone: o.phone ?? "",
      website: o.website ?? "",
      addressLine: o.addressLine ?? "",
      city: o.city ?? "",
      region: o.region ?? "",
      postalCode: o.postalCode ?? "",
      descriptionTone: o.settings.descriptionTone ?? "PROFESSIONAL",
      includeDisclaimer: o.settings.includeDisclaimer ?? true,
      staleListingDays: String(o.settings.staleListingDays ?? 7),
    });
  }, [data]);

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  if (!data || !orgId) return null;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await api(`/api/v1/orgs/${orgId}`, {
        method: "PATCH",
        body: {
          name: form.name,
          phone: form.phone,
          website: form.website,
          addressLine: form.addressLine,
          city: form.city,
          region: form.region,
          postalCode: form.postalCode,
          settings: {
            descriptionTone: form.descriptionTone,
            includeDisclaimer: form.includeDisclaimer,
            staleListingDays: Number(form.staleListingDays),
          },
        },
      });
      setNotice("Settings saved.");
      reload();
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Dealership profile and listing defaults." />
      {notice && <p className="mb-3 text-sm text-indigo-700">{notice}</p>}
      <form onSubmit={save} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Dealership profile">
          <div className="space-y-3">
            <Field label="Name">
              <input className={inputClass} required value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <input className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Website">
                <input className={inputClass} value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://…" />
              </Field>
            </div>
            <Field label="Street address">
              <input className={inputClass} value={form.addressLine} onChange={(e) => set("addressLine", e.target.value)} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="City">
                <input className={inputClass} value={form.city} onChange={(e) => set("city", e.target.value)} />
              </Field>
              <Field label="State">
                <input className={inputClass} value={form.region} onChange={(e) => set("region", e.target.value)} />
              </Field>
              <Field label="ZIP">
                <input className={inputClass} value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
              </Field>
            </div>
          </div>
        </Card>
        <Card title="Listing defaults">
          <div className="space-y-3">
            <Field label="Description tone" hint="Used by AI/template description generation.">
              <select className={inputClass} value={form.descriptionTone} onChange={(e) => set("descriptionTone", e.target.value)}>
                <option value="PROFESSIONAL">Professional</option>
                <option value="FRIENDLY">Friendly</option>
                <option value="ENTHUSIASTIC">Enthusiastic</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.includeDisclaimer}
                onChange={(e) => set("includeDisclaimer", e.target.checked)}
              />
              Append pricing/availability disclaimer to generated descriptions
            </label>
            <Field label="Stale listing reminder (days)" hint="Salespeople get a reminder to renew listings older than this.">
              <input
                className={inputClass}
                type="number"
                min={1}
                max={60}
                value={form.staleListingDays}
                onChange={(e) => set("staleListingDays", e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
