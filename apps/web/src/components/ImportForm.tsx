"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ImportForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/v1/vehicles/import", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Import failed");
      return;
    }
    setMessage(
      `Imported ${data.totalParsed} rows · created ${data.created} · updated ${data.updated} · sold alerts ${data.soldDetected}`,
    );
    router.refresh();
  }

  return (
    <form className="panel" style={{ marginTop: "1rem" }} onSubmit={onSubmit}>
      <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>CSV import</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Required columns: stockNumber, year, make, model, price. Optional: vin, mileage, photos (pipe-separated URLs),
        status.
      </p>
      <div className="field">
        <label className="label" htmlFor="file">
          CSV file
        </label>
        <input className="input" id="file" name="file" type="file" accept=".csv,text/csv" required />
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Importing…" : "Import inventory"}
      </button>
    </form>
  );
}
