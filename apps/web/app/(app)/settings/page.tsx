"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { VERTICALS } from "@okauto/shared";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner } from "@/components/ui";
import { formatDateTime, humanize, statusColor } from "@/lib/format";

const TABS = ["general", "templates", "sources", "extension"] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SettingsInner />
    </Suspense>
  );
}

function SettingsInner() {
  const params = useSearchParams();
  const { activeRole } = useAuth();
  const initial = (params.get("tab") as Tab) || "general";
  const [tab, setTab] = useState<Tab>(TABS.includes(initial) ? initial : "general");
  const canManageOrg = activeRole === "ORG_OWNER";
  const canManageSources = activeRole === "ORG_OWNER" || activeRole === "ORG_MANAGER";

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="mb-5 flex gap-2" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${
              tab === t ? "bg-brand-600 text-white" : "bg-ink-800 text-ink-400 hover:text-ink-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "general" ? <GeneralTab canManageOrg={canManageOrg} /> : null}
      {tab === "templates" ? <TemplatesTab canManage={canManageSources} /> : null}
      {tab === "sources" ? <SourcesTab canManage={canManageSources} /> : null}
      {tab === "extension" ? <ExtensionTab canManageAll={canManageOrg} /> : null}
    </div>
  );
}

function GeneralTab({ canManageOrg }: { canManageOrg: boolean }) {
  const { api } = useAuth();
  const [org, setOrg] = useState<{ name: string; timezone: string; vertical: string; settings: Record<string, unknown> } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    api<{ org: { name: string; timezone: string; vertical: string; settings: Record<string, unknown> } }>("/orgs/current")
      .then((res) => setOrg(res.org))
      .catch(() => undefined);
  }, [api]);

  if (!org) return <Spinner />;

  const save = async () => {
    await api("/orgs/current", {
      method: "PATCH",
      body: {
        name: org.name,
        timezone: org.timezone,
        vertical: org.vertical,
        settings: org.settings,
      },
    });
    setSaved("Saved.");
    setTimeout(() => setSaved(null), 3000);
  };

  return (
    <Card className="max-w-2xl">
      <h2 className="mb-4 font-bold">Organization</h2>
      <div className="space-y-4">
        <Field label="Dealership name">
          <Input value={org.name} disabled={!canManageOrg} onChange={(e) => setOrg({ ...org, name: e.target.value })} />
        </Field>
        <Field label="Vertical">
          <Select value={org.vertical} disabled={!canManageOrg} onChange={(e) => setOrg({ ...org, vertical: e.target.value })} className="w-full">
            {VERTICALS.map((v) => (
              <option key={v} value={v}>{humanize(v)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Timezone">
          <Input value={org.timezone} disabled={!canManageOrg} onChange={(e) => setOrg({ ...org, timezone: e.target.value })} />
        </Field>
        <Field label="Dealer contact line (used in descriptions)">
          <Input
            value={String(org.settings.dealerContact ?? "")}
            disabled={!canManageOrg}
            onChange={(e) => setOrg({ ...org, settings: { ...org.settings, dealerContact: e.target.value } })}
            placeholder="(555) 010-0100"
          />
        </Field>
        <Field label="Compliance footer (appended to every generated description)">
          <textarea
            className="h-24 w-full rounded-lg border border-ink-600 bg-ink-900 p-3 text-sm"
            value={String(org.settings.descriptionFooter ?? "")}
            disabled={!canManageOrg}
            onChange={(e) => setOrg({ ...org, settings: { ...org.settings, descriptionFooter: e.target.value } })}
          />
        </Field>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!canManageOrg}
              checked={org.settings.soldDetectionEnabled !== false}
              onChange={(e) => setOrg({ ...org, settings: { ...org.settings, soldDetectionEnabled: e.target.checked } })}
            />
            Sold detection
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!canManageOrg}
              checked={org.settings.priceChangeAlertsEnabled !== false}
              onChange={(e) => setOrg({ ...org, settings: { ...org.settings, priceChangeAlertsEnabled: e.target.checked } })}
            />
            Price-change alerts
          </label>
        </div>
        {canManageOrg ? <Button onClick={() => void save()}>Save changes</Button> : <p className="text-xs text-ink-400">Only owners can edit organization settings.</p>}
        {saved ? <p role="status" className="text-sm text-brand-300">{saved}</p> : null}
      </div>
    </Card>
  );
}

interface Template {
  id: string;
  name: string;
  body: string;
  isDefault: boolean;
}

function TemplatesTab({ canManage }: { canManage: boolean }) {
  const { api } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ templates: Template[] }>("/description-templates");
    setTemplates(res.templates);
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    if (editing.id === "new") {
      await api("/description-templates", { method: "POST", body: { name: editing.name, body: editing.body, isDefault: editing.isDefault } });
    } else {
      await api(`/description-templates/${editing.id}`, { method: "PATCH", body: { name: editing.name, body: editing.body, isDefault: editing.isDefault } });
    }
    setEditing(null);
    setMsg("Template saved.");
    await load();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Description templates</h2>
          {canManage ? (
            <Button size="sm" onClick={() => setEditing({ id: "new", name: "", body: "{{year}} {{make}} {{model}}{{#trim}} {{trim}}{{/trim}}\n\n{{summaryLine}}\n\n{{specLines}}\n\n{{dealerLine}}\n\n{{footer}}", isDefault: false })}>
              New template
            </Button>
          ) : null}
        </div>
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded-lg bg-ink-900/60 px-3 py-2">
              <div>
                <p className="text-sm font-semibold">{t.name}</p>
                {t.isDefault ? <Badge colorClass="bg-brand-900/60 text-brand-300">default</Badge> : null}
              </div>
              {canManage ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>Edit</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void api(`/description-templates/${t.id}`, { method: "DELETE" }).then(load)}
                  >
                    Delete
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {msg ? <p role="status" className="mt-2 text-sm text-brand-300">{msg}</p> : null}
        <p className="mt-3 text-xs text-ink-400">
          Placeholders: {"{{year}} {{make}} {{model}} {{#trim}}…{{/trim}} {{summaryLine}} {{specLines}} {{dealerLine}} {{footer}}"}.
          Output is always scrubbed for misleading claims.
        </p>
      </Card>

      {editing ? (
        <Card>
          <h2 className="mb-3 font-bold">{editing.id === "new" ? "New template" : `Edit: ${editing.name}`}</h2>
          <div className="space-y-3">
            <Field label="Name">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Body">
              <textarea
                className="h-56 w-full rounded-lg border border-ink-600 bg-ink-900 p-3 font-mono text-xs"
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.isDefault} onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })} />
              Default template
            </label>
            <div className="flex gap-2">
              <Button onClick={() => void save()} disabled={!editing.name.trim() || !editing.body.trim()}>Save</Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

interface Source {
  id: string;
  name: string;
  type: string;
  status: string;
  scheduleMinutes: number;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  config: { feedUrl?: string; webhookSecret?: string };
  _count: { vehicles: number };
}

function SourcesTab({ canManage }: { canManage: boolean }) {
  const { api } = useAuth();
  const [sources, setSources] = useState<Source[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "JSON_FEED", feedUrl: "", scheduleMinutes: "60", webhookSecret: "" });
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ sources: Source[] }>("/imports/sources");
    setSources(res.sources);
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    await api("/imports/sources", {
      method: "POST",
      body: {
        name: form.name,
        type: form.type,
        scheduleMinutes: Number(form.scheduleMinutes) || 0,
        config: {
          ...(form.type === "JSON_FEED" ? { feedUrl: form.feedUrl } : {}),
          ...(form.type === "WEBHOOK" && form.webhookSecret ? { webhookSecret: form.webhookSecret } : {}),
        },
      },
    });
    setOpen(false);
    setForm({ name: "", type: "JSON_FEED", feedUrl: "", scheduleMinutes: "60", webhookSecret: "" });
    await load();
  };

  const runNow = async (id: string) => {
    setMsg(null);
    const res = await api<{ jobId: string }>(`/imports/sources/${id}/run`, { method: "POST", body: {} });
    setMsg(`Sync queued (job ${res.jobId.slice(0, 8)}…) — check Analytics → Sync health shortly.`);
  };

  return (
    <Card className="max-w-3xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">Import sources</h2>
        {canManage ? <Button size="sm" onClick={() => setOpen(true)}>Add source</Button> : null}
      </div>
      <ul className="space-y-2">
        {sources.map((s) => (
          <li key={s.id} className="rounded-lg bg-ink-900/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{s.name} <span className="text-xs text-ink-400">({s.type})</span></p>
              <div className="flex items-center gap-2">
                {s.lastStatus ? <Badge colorClass={statusColor(s.lastStatus)}>{humanize(s.lastStatus)}</Badge> : null}
                {s.type === "JSON_FEED" && canManage ? (
                  <Button size="sm" variant="secondary" onClick={() => void runNow(s.id)}>Run now</Button>
                ) : null}
              </div>
            </div>
            <p className="mt-1 text-xs text-ink-400">
              {s._count.vehicles} vehicles • last run {s.lastRunAt ? formatDateTime(s.lastRunAt) : "never"}
              {s.scheduleMinutes > 0 ? ` • every ${s.scheduleMinutes}m` : ""}
            </p>
            {s.type === "WEBHOOK" && s.config.webhookSecret ? (
              <p className="mt-1 text-xs text-ink-400">
                Push to <code className="font-mono text-brand-300">POST /api/v1/imports/webhook/{s.id}</code> with header{" "}
                <code className="font-mono">x-okauto-signature</code> = HMAC-SHA256(secret, body). Secret:{" "}
                <code className="select-all font-mono">{s.config.webhookSecret}</code>
              </p>
            ) : null}
            {s.lastError ? <p className="mt-1 text-xs text-red-300">{s.lastError}</p> : null}
          </li>
        ))}
      </ul>
      {msg ? <p role="status" className="mt-3 text-sm text-brand-300">{msg}</p> : null}

      <Modal open={open} onClose={() => setOpen(false)} title="Add import source">
        <div className="space-y-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Website feed" />
          </Field>
          <Field label="Type">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full">
              <option value="JSON_FEED">JSON feed (pull)</option>
              <option value="WEBHOOK">Webhook (push, HMAC)</option>
            </Select>
          </Field>
          {form.type === "JSON_FEED" ? (
            <>
              <Field label="Feed URL" hint="JSON array or { items: [...] } of vehicles.">
                <Input value={form.feedUrl} onChange={(e) => setForm({ ...form, feedUrl: e.target.value })} placeholder="https://dealer.com/feed.json" />
              </Field>
              <Field label="Schedule (minutes, 0 = manual)">
                <Input inputMode="numeric" value={form.scheduleMinutes} onChange={(e) => setForm({ ...form, scheduleMinutes: e.target.value })} />
              </Field>
            </>
          ) : (
            <Field label="Webhook secret (leave blank to auto-generate)">
              <Input value={form.webhookSecret} onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })} />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void create()} disabled={!form.name.trim() || (form.type === "JSON_FEED" && !form.feedUrl.trim())}>Create</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

interface ExtToken {
  id: string;
  label: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  user?: { name: string };
}

function ExtensionTab({ canManageAll }: { canManageAll: boolean }) {
  const { api } = useAuth();
  const [tokens, setTokens] = useState<ExtToken[]>([]);
  const [label, setLabel] = useState("");
  const [plaintext, setPlaintext] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ tokens: ExtToken[] }>("/extension/tokens");
    setTokens(res.tokens);
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const res = await api<{ plaintext: string }>("/extension/tokens", { method: "POST", body: { label } });
    setPlaintext(res.plaintext);
    setLabel("");
    await load();
  };

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <h2 className="mb-2 font-bold">Pair the Chrome extension</h2>
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-ink-400">
          <li>Load <code className="font-mono text-brand-300">apps/extension/dist</code> via chrome://extensions → Developer mode → Load unpacked.</li>
          <li>Create a pairing token below and copy it (shown once).</li>
          <li>Open the extension's Options page, paste API URL + token, and test the connection.</li>
        </ol>
        <div className="flex gap-2">
          <Input placeholder="Token label (e.g. Showroom laptop)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button onClick={() => void create()} disabled={!label.trim()}>Create token</Button>
        </div>
        {plaintext ? (
          <div className="mt-3 rounded-lg bg-brand-900/30 p-3" role="status">
            <p className="text-xs font-semibold text-brand-300">Copy now — shown only once:</p>
            <p className="mt-1 select-all break-all font-mono text-sm text-ink-200">{plaintext}</p>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-3 font-bold">Tokens</h2>
        <ul className="space-y-2">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded-lg bg-ink-900/60 px-3 py-2 text-sm">
              <div>
                <p className="font-semibold">
                  {t.label} <span className="font-mono text-xs text-ink-400">{t.prefix}…</span>
                  {canManageAll && t.user ? <span className="text-xs text-ink-400"> • {t.user.name}</span> : null}
                </p>
                <p className="text-xs text-ink-400">
                  created {formatDateTime(t.createdAt)} • last used {t.lastUsedAt ? formatDateTime(t.lastUsedAt) : "never"}
                </p>
              </div>
              {t.revokedAt ? (
                <Badge colorClass="bg-ink-700/60 text-ink-200">revoked</Badge>
              ) : (
                <Button size="sm" variant="danger" onClick={() => void api(`/extension/tokens/${t.id}`, { method: "DELETE" }).then(load)}>
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
