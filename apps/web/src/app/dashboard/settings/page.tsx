"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";

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
  const [allInConfirmedAt, setAllInConfirmedAt] = useState<string | null>(null);
  const [includeCarfaxSourceUrl, setIncludeCarfaxSourceUrl] = useState(false);
  const [catalog, setCatalog] = useState<{
    enabled?: boolean;
    feedUrl?: string | null;
    preview?: {
      included: number;
      excluded: Array<{ title: string; reasons: string[] }>;
      warnings: unknown[];
    };
  } | null>(null);
  const [catalogMessage, setCatalogMessage] = useState("");

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
          monthlyListingLimit: String(
            d.marketplaceMonthlyVehicleLimit ?? d.monthlyListingLimit ?? 5,
          ),
          listingRenewalDays: String(d.listingRenewalDays ?? 7),
          listingLocale: d.listingLocale ?? "fr",
          listingLanguage: d.listingLanguage ?? "fr",
          freightFee: String(d.freightFee ?? 0),
          pdiFee: String(d.pdiFee ?? 0),
          adminFee: String(d.adminFee ?? 0),
          acExciseFee: String(d.acExciseFee ?? 0),
        });
        setAllInConfirmedAt(d.allInPriceConfirmedAt ?? null);
        setIncludeCarfaxSourceUrl(Boolean(d.includeCarfaxSourceUrl));
      });
    apiFetch("/api/v1/admin/meta-catalog")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setCatalog(d);
      })
      .catch(() => undefined);
  }, [apiFetch]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch("/api/v1/organizations/current", {
      method: "PATCH",
      body: JSON.stringify({
        name: org.name,
        website: org.website || null,
        phone: org.phone || null,
        address: org.address || null,
        city: org.city || null,
        state: org.state || null,
        zip: org.zip || null,
        monthlyListingLimit: Number(org.monthlyListingLimit),
        marketplaceMonthlyVehicleLimit: Number(org.monthlyListingLimit),
        listingRenewalDays: Number(org.listingRenewalDays),
        listingLocale: org.listingLocale,
        listingLanguage: org.listingLanguage === "fr_en" ? "fr_en" : "fr",
        freightFee: Number(org.freightFee || 0),
        pdiFee: Number(org.pdiFee || 0),
        adminFee: Number(org.adminFee || 0),
        acExciseFee: Number(org.acExciseFee || 0),
        includeCarfaxSourceUrl,
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const canEdit = role === "OWNER" || role === "ADMIN";

  const confirmAllIn = async () => {
    const response = await apiFetch("/api/v1/organizations/current", {
      method: "PATCH",
      body: JSON.stringify({ confirmAllInPrice: true }),
    });
    if (response.ok) {
      const data = await response.json();
      setAllInConfirmedAt(data.allInPriceConfirmedAt);
    }
  };

  const catalogAction = async (action: "enable" | "disable" | "rotate") => {
    setCatalogMessage("");
    const response = await apiFetch("/api/v1/admin/meta-catalog", {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setCatalogMessage(data.error ?? "Action impossible.");
      return;
    }
    const refresh = await apiFetch("/api/v1/admin/meta-catalog");
    if (refresh.ok) setCatalog(await refresh.json());
    setCatalogMessage(
      action === "enable"
        ? "Flux activé. Collez le lien dans le Commerce Manager."
        : action === "rotate"
          ? "Nouveau lien généré. L’ancien ne fonctionne plus."
          : "Flux désactivé.",
    );
  };
  const profileFields: Record<string, string> = {
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
      <h1 className="mb-6 text-2xl font-bold">Paramètres</h1>
      <div className="card mb-6 max-w-lg">
        <ThemeToggle variant="list" />
        <p className="mt-3 text-sm text-muted-foreground">
          Clair le jour, sombre le soir — ou suivez le système.
        </p>
      </div>
      <form onSubmit={handleSave} className="card max-w-lg space-y-4">
        {Object.entries(profileFields).map(([field, label]) => (
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

        <h2 className="pt-2 font-semibold">Conformité et annonces</h2>
        <p className="text-sm text-muted-foreground">
          Je confirme que les prix de l’inventaire synchronisé sont des{" "}
          <strong>prix tout inclus</strong> : transport, préparation, livraison,
          frais d’administration et taxe d’accise sur les climatiseurs compris.
          Seules la TPS, la TVQ et le droit spécifique sur les pneus neufs
          s’ajoutent.{" "}
          <a
            className="font-semibold underline"
            href="https://www.opc.gouv.qc.ca/commercant/secteur/vehicule/publicite/regle/prix"
            target="_blank"
            rel="noreferrer"
          >
            Règle de l’OPC
          </a>
        </p>
        {allInConfirmedAt ? (
          <p className="text-sm text-signal">
            Confirmé le {new Date(allInConfirmedAt).toLocaleString("fr-CA")}.
          </p>
        ) : canEdit ? (
          <button type="button" className="btn-secondary" onClick={() => void confirmAllIn()}>
            Confirmer les prix tout inclus
          </button>
        ) : (
          <p className="text-sm text-warning">
            En attente de confirmation par la direction.
          </p>
        )}
        {(
          [
            ["freightFee", "Frais de transport / livraison ($)"],
            ["pdiFee", "Préparation (PDI) ($)"],
            ["adminFee", "Frais d’administration ($)"],
            ["acExciseFee", "Accise climatiseur ($)"],
          ] as const
        ).map(([field, label]) => (
          <div key={field}>
            <label className="block text-sm font-medium mb-1" htmlFor={field}>
              {label}
            </label>
            <input
              id={field}
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={org[field] ?? "0"}
              onChange={(e) => setOrg({ ...org, [field]: e.target.value })}
              disabled={!canEdit}
            />
          </div>
        ))}

        <h2 className="pt-2 font-semibold">Publications Marketplace</h2>
        <label className="block text-sm font-medium" htmlFor="monthlyListingLimit">
          Quota mensuel indiqué (configurable — la limite de 5/mois n’est pas
          confirmée pour chaque compte canadien)
        </label>
        <input
          id="monthlyListingLimit"
          type="number"
          min="1"
          max="50"
          className="input"
          value={org.monthlyListingLimit ?? "5"}
          onChange={(e) =>
            setOrg({ ...org, monthlyListingLimit: e.target.value })
          }
          disabled={!canEdit}
        />
        <label className="block text-sm font-medium" htmlFor="listingRenewalDays">
          Renouveler après (jours)
        </label>
        <input
          id="listingRenewalDays"
          type="number"
          min="3"
          max="90"
          className="input"
          value={org.listingRenewalDays ?? "14"}
          onChange={(e) =>
            setOrg({ ...org, listingRenewalDays: e.target.value })
          }
          disabled={!canEdit}
        />
        <label className="block text-sm font-medium" htmlFor="listingLanguage">
          Langue des annonces
        </label>
        <select
          id="listingLanguage"
          className="input"
          value={org.listingLanguage ?? "fr"}
          onChange={(e) => setOrg({ ...org, listingLanguage: e.target.value })}
          disabled={!canEdit}
        >
          <option value="fr">Français seulement</option>
          <option value="fr_en">Français puis anglais</option>
        </select>
        <p className="text-xs text-muted-foreground">
          La version française apparaît en premier et reste au moins aussi
          complète (Charte de la langue française).
        </p>
        <label className="flex items-start gap-2 pt-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={includeCarfaxSourceUrl}
            onChange={(e) => setIncludeCarfaxSourceUrl(e.target.checked)}
            disabled={!canEdit}
          />
          <span>
            Inclure le lien de la fiche concessionnaire (
            <code className="text-xs">sourceUrl</code>) dans la mention Carfax
            des annonces. Désactivé par défaut : le texte est « Rapport Carfax
            gratuit disponible, écrivez-nous ! » sans URL, pour éviter qu’une
            annonce Marketplace soit signalée. Testez d’abord sur un seul
            véhicule (fiche inventaire), puis activez ici pour tout le parc.
            Occasion et démonstrateurs seulement ; les neufs n’ont pas la
            mention.
          </span>
        </label>
        <label className="block text-sm font-medium" htmlFor="listingLocale">
          Gabarit d’aperçu
        </label>
        <select
          id="listingLocale"
          className="input"
          value={org.listingLocale ?? "fr"}
          onChange={(e) => setOrg({ ...org, listingLocale: e.target.value })}
          disabled={!canEdit}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="bilingual">Bilingue FR + EN</option>
        </select>

        {canEdit && (
          <button type="submit" className="btn-primary">
            {saved ? "Enregistré" : "Enregistrer"}
          </button>
        )}
      </form>

      <div className="card mt-6 max-w-lg" id="catalogue-meta">
        <h2 className="font-semibold mb-2">
          Catalogue Meta (publicités d’inventaire)
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Diffusez tout votre inventaire par la voie officielle de Meta. Suivia
          fournit le flux CSV ; vous gardez le contrôle des campagnes et du
          budget dans le Gestionnaire de publicités. Suivia ne crée aucune
          publicité et n’engage aucune dépense.
        </p>
        {catalog?.preview && (
          <p className="mb-3 text-sm text-foreground">
            <strong>{catalog.preview.included} véhicules inclus</strong> ·{" "}
            {catalog.preview.excluded.length} exclus ·{" "}
            {Array.isArray(catalog.preview.warnings)
              ? catalog.preview.warnings.length
              : 0}{" "}
            avertissements
          </p>
        )}
        {catalog?.feedUrl && (
          <p className="mb-3 break-all rounded bg-muted px-2 py-1 text-xs">
            {catalog.feedUrl}
          </p>
        )}
        {catalogMessage && (
          <p className="mb-3 text-sm">{catalogMessage}</p>
        )}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void catalogAction(catalog?.enabled ? "disable" : "enable")}
            >
              {catalog?.enabled ? "Désactiver le flux" : "Activer le flux"}
            </button>
            {catalog?.enabled && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  if (
                    window.confirm(
                      "L’ancien lien cessera de fonctionner immédiatement. Mettez à jour la source de données dans Meta.",
                    )
                  ) {
                    void catalogAction("rotate");
                  }
                }}
              >
                Régénérer le lien
              </button>
            )}
          </div>
        )}
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Commerce Manager &gt; Ajouter un catalogue &gt; Auto &gt; Véhicules.</li>
          <li>Sources de données &gt; Flux planifié &gt; collez le lien.</li>
          <li>Fréquence : toutes les heures ou quotidienne.</li>
          <li>
            Dans le Gestionnaire de publicités, créez une campagne avec le
            catalogue.
          </li>
        </ol>
      </div>

      <div className="card mt-6 max-w-lg">
        <h2 className="font-semibold mb-2">
          Assistant Chrome — parcours express
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Le Centre fonctionne sans extension. Avec l’assistant, le bouton «
          Publier sur Marketplace » ouvre Facebook, préremplit les champs et
          tente d’ajouter la photo principale. Vous gardez la vérification et le
          clic final « Publier ».
        </p>
        <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
          <li>
            Ouvrez{" "}
            <code className="rounded bg-muted px-1">
              chrome://extensions
            </code>
          </li>
          <li>
            Activez le mode développeur, puis « Charger l’extension non
            empaquetée »
          </li>
          <li>
            Choisissez{" "}
            <code className="rounded bg-muted px-1">
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
