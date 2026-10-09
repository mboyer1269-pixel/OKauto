"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";
import { formatDateTime } from "@/lib/utils";

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  source: string;
  status: string;
  nextFollowUpAt: string | null;
  createdAt: string;
  vehicle: {
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    stockNumber: string | null;
  } | null;
  assignedTo: { id: string; name: string } | null;
}

const STATUSES = [
  { id: "", label: "Tous" },
  { id: "NEW", label: "Nouveau" },
  { id: "CONTACTED", label: "Contacté" },
  { id: "APPOINTMENT", label: "Rendez-vous" },
  { id: "SOLD", label: "Vendu" },
  { id: "LOST", label: "Perdu" },
];

const STATUS_LABEL: Record<string, string> = {
  NEW: "Nouveau",
  CONTACTED: "Contacté",
  APPOINTMENT: "Rendez-vous",
  SOLD: "Vendu",
  LOST: "Perdu",
};

export default function LeadsPage() {
  return (
    <ProtectedRoute>
      <LeadsContent />
    </ProtectedRoute>
  );
}

function LeadsContent() {
  const { apiFetch } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    message: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "50" });
    if (status) params.set("status", status);
    const response = await apiFetch(`/api/v1/leads?${params}`);
    if (!response.ok) {
      setError("Impossible de charger les leads.");
      return;
    }
    const data = await response.json();
    setLeads(data.leads ?? []);
  }, [apiFetch, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const createLead = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const response = await apiFetch("/api/v1/leads", {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        message: form.message || null,
        source: "MARKETPLACE",
      }),
    });
    if (!response.ok) {
      setError("Le lead n’a pas pu être enregistré.");
      return;
    }
    setForm({ name: "", phone: "", email: "", message: "" });
    setMessage("Lead Marketplace enregistré.");
    await load();
  };

  const updateStatus = async (id: string, nextStatus: string) => {
    const response = await apiFetch(`/api/v1/leads/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!response.ok) {
      setError("Le statut n’a pas pu être mis à jour.");
      return;
    }
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leads Marketplace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saisissez manuellement les personnes qui écrivent sur Messenger. Suivia
          n’aspire pas Messenger et ne contourne aucune limite Meta.
        </p>
      </div>

      {(message || error) && (
        <p className={error ? "text-sm text-destructive" : "text-sm text-signal"}>
          {error || message}
        </p>
      )}

      <form onSubmit={createLead} className="card grid gap-3 md:grid-cols-2">
        <h2 className="font-bold md:col-span-2">Nouveau lead</h2>
        <input
          className="input"
          required
          placeholder="Nom"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <input
          className="input"
          placeholder="Téléphone"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
        />
        <input
          className="input"
          placeholder="Courriel"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        <textarea
          className="input md:col-span-2"
          placeholder="Message ou note (Messenger, véhicule demandé…)"
          value={form.message}
          onChange={(event) =>
            setForm({ ...form, message: event.target.value })
          }
        />
        <button type="submit" className="btn-primary md:col-span-2">
          Enregistrer le lead
        </button>
      </form>

      <div className="flex gap-2 overflow-x-auto">
        {STATUSES.map((item) => (
          <button
            key={item.id || "all"}
            type="button"
            className={
              status === item.id
                ? "btn-primary"
                : "btn-secondary"
            }
            onClick={() => setStatus(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {leads.length === 0 ? (
        <div className="card text-sm text-muted-foreground">
          Aucun lead pour le moment. Ajoutez le premier dès qu’un acheteur écrit
          sur Marketplace.
        </div>
      ) : (
        <div className="grid gap-3">
          {leads.map((lead) => (
            <article key={lead.id} className="card space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">{lead.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {lead.phone || "Sans téléphone"}
                    {lead.email ? ` · ${lead.email}` : ""}
                  </p>
                </div>
                <select
                  className="input w-auto"
                  value={lead.status}
                  onChange={(event) =>
                    void updateStatus(lead.id, event.target.value)
                  }
                  aria-label={`Statut de ${lead.name}`}
                >
                  {STATUSES.filter((item) => item.id).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              {lead.vehicle && (
                <p className="text-sm">
                  Véhicule :{" "}
                  {[lead.vehicle.year, lead.vehicle.make, lead.vehicle.model]
                    .filter(Boolean)
                    .join(" ")}{" "}
                  ({lead.vehicle.stockNumber ?? "s. o."})
                </p>
              )}
              {lead.message && (
                <p className="text-sm text-foreground">{lead.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {STATUS_LABEL[lead.status] ?? lead.status} ·{" "}
                {formatDateTime(lead.createdAt)}
                {lead.assignedTo ? ` · ${lead.assignedTo.name}` : ""}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
