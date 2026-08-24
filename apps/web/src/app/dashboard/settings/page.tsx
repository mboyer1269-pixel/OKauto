"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}

function SettingsContent() {
  const { apiFetch, role } = useAuth();
  const [org, setOrg] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch("/api/v1/organizations/current")
      .then((r) => r.json())
      .then((d) => {
        setOrg({
          name: d.name ?? "",
          website: d.website ?? "",
          phone: d.phone ?? "",
          address: d.address ?? "",
          city: d.city ?? "",
          state: d.state ?? "",
          zip: d.zip ?? "",
        });
      });
  }, [apiFetch]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch("/api/v1/organizations/current", {
      method: "PATCH",
      body: JSON.stringify(org),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const canEdit = role === "OWNER" || role === "ADMIN";
  const fields: Record<string, string> = {
    name: "Nom du concessionnaire",
    website: "Site Web",
    phone: "Téléphone",
    address: "Adresse",
    city: "Ville",
    state: "Province",
    zip: "Code postal",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Paramètres</h1>
      <form onSubmit={handleSave} className="card max-w-lg space-y-4">
        {Object.entries(fields).map(([field, label]) => (
          <div key={field}>
            <label
              htmlFor={`org-${field}`}
              className="block text-sm font-medium mb-1"
            >
              {label}
            </label>
            <input
              id={`org-${field}`}
              name={field}
              className="input"
              value={org[field] ?? ""}
              onChange={(e) => setOrg({ ...org, [field]: e.target.value })}
              disabled={!canEdit}
            />
          </div>
        ))}
        {canEdit && (
          <button type="submit" className="btn-primary">
            {saved ? "Enregistré" : "Enregistrer"}
          </button>
        )}
      </form>

      <div className="card mt-6 max-w-lg">
        <h2 className="font-semibold mb-2">
          Assistant Chrome — parcours express
        </h2>
        <p className="text-sm text-slate-600 mb-3">
          Le Centre fonctionne sans extension. Avec l’assistant, le bouton «
          Publier sur Marketplace » ouvre Facebook, préremplit les champs et
          tente d’ajouter la photo principale. Vous gardez la vérification et le
          clic final « Publier ».
        </p>
        <ol className="text-sm text-slate-600 list-decimal list-inside space-y-1">
          <li>
            Ouvrez{" "}
            <code className="bg-slate-100 px-1 rounded">
              chrome://extensions
            </code>
          </li>
          <li>
            Activez le mode développeur, puis « Charger l’extension non
            empaquetée »
          </li>
          <li>
            Choisissez{" "}
            <code className="bg-slate-100 px-1 rounded">
              apps/extension/dist
            </code>
          </li>
          <li>
            Créez une clé dans « Clés API », puis collez-la dans l’assistant
          </li>
          <li>
            Après une mise à jour, cliquez sur « Recharger » dans Chrome, puis
            actualisez Suivia Auto
          </li>
        </ol>
      </div>
    </div>
  );
}
