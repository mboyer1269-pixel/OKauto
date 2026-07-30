"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import { Card, CardHeader } from "@/components/ui";

export function DescriptionEditor({
  orgId,
  vehicleId,
  initialDescription,
  descriptionSource,
}: {
  orgId: string;
  vehicleId: string;
  initialDescription: string;
  descriptionSource: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialDescription);
  const [source, setSource] = useState(descriptionSource);
  const [tone, setTone] = useState("professional");
  const [busy, setBusy] = useState<"generate" | "save" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy("generate");
    setError(null);
    setMessage(null);
    try {
      const data = await api<{ description: string; source: string }>(
        `/api/v1/orgs/${orgId}/vehicles/${vehicleId}/describe`,
        { method: "POST", json: { tone, save: false } },
      );
      setText(data.description);
      setSource(data.source.toUpperCase());
      setMessage(
        data.source === "ai"
          ? "Generated with AI — review before saving."
          : "Generated from the compliant template — review before saving.",
      );
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Generation failed");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/vehicles/${vehicleId}`, {
        method: "PATCH",
        json: { description: text },
      });
      setMessage("Description saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(text);
    setMessage("Copied to clipboard.");
  }

  return (
    <Card>
      <CardHeader
        title="Marketplace description"
        subtitle={source !== "NONE" ? `Source: ${source.toLowerCase()}` : "Not generated yet"}
        action={
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="tone">
              Tone
            </label>
            <select id="tone" className="input w-auto py-1.5" value={tone} onChange={(e) => setTone(e.target.value)}>
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="energetic">Energetic</option>
            </select>
            <button className="btn-secondary" onClick={generate} disabled={busy !== null}>
              {busy === "generate" ? "Generating…" : "Generate"}
            </button>
          </div>
        }
      />
      <div className="space-y-3 p-5">
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
        <textarea
          className="input min-h-56 font-mono text-xs leading-relaxed"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Click Generate to draft a compliant Marketplace description, or write your own."
          aria-label="Vehicle description"
        />
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={copy} disabled={!text}>
            Copy
          </button>
          <button className="btn-primary" onClick={save} disabled={busy !== null || !text}>
            {busy === "save" ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Card>
  );
}
