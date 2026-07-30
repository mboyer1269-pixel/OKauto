"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VehicleActions({
  vehicleId,
  canList,
}: {
  vehicleId: string;
  canList: boolean;
}) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/v1/vehicles/${vehicleId}/describe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tone: "professional" }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to generate description");
      return;
    }
    setDescription(data.description);
    setProvider(data.provider);
  }

  async function startListing() {
    setLoading(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/v1/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId,
        description: description || undefined,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to create listing assist");
      return;
    }
    setMessage(
      `Listing assist ready (${data.listing.id}). Open the Chrome extension on Marketplace create to fill fields — you publish.`,
    );
    router.refresh();
  }

  return (
    <section className="panel">
      <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Listing assist</h2>
      <p className="muted">
        Generate a description, then create an assist session. The extension fills Marketplace fields; you complete
        any challenges and click Publish.
      </p>
      <div className="cta-row" style={{ marginBottom: "0.75rem" }}>
        <button className="btn btn-secondary" type="button" onClick={generate} disabled={loading}>
          Generate description
        </button>
        <button className="btn" type="button" onClick={startListing} disabled={loading || !canList}>
          Start assist listing
        </button>
      </div>
      {provider ? <p className="muted">Provider: {provider}</p> : null}
      <textarea
        className="textarea"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description preview"
        aria-label="Listing description"
      />
      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}
    </section>
  );
}
