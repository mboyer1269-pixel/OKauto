import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Check,
  Gauge,
  Images,
  Users,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { isPublicSignupEnabled } from "@/lib/signup";

const workflow = [
  {
    label: "Inventaire reçu",
    detail: "177 véhicules synchronisés",
    state: "done",
  },
  {
    label: "Annonce préparée",
    detail: "Photos, prix et description prêts",
    state: "active",
  },
  {
    label: "Publication suivie",
    detail: "Responsable et statut enregistrés",
    state: "next",
  },
];

export default function HomePage() {
  const publicSignupEnabled = isPublicSignupEnabled();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <BrandMark />
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="btn-secondary">
              Se connecter
            </Link>
            {publicSignupEnabled && (
              <Link
                href="/register"
                className="btn-primary hidden sm:inline-flex"
              >
                Créer un espace
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,hsl(var(--primary)/0.14),transparent_34%),linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted))_100%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:py-24">
            <div>
              <p className="brand-label mb-5 text-xs font-bold uppercase tracking-[0.22em] text-primary">
                Centre de publication automobile
              </p>
              <h1 className="brand-display max-w-3xl text-5xl font-bold leading-[0.97] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
                Chaque véhicule.
                <br />
                <span className="text-primary">Toujours suivi.</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">
                Suivia rassemble l’inventaire, les photos, les descriptions et
                le suivi des publications dans un espace partagé par toute votre
                équipe.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {publicSignupEnabled ? (
                  <Link
                    href="/register"
                    className="btn-primary px-6 py-3 text-base"
                  >
                    Créer mon espace <ArrowRight className="ml-2" size={19} />
                  </Link>
                ) : null}
                <Link
                  href="/login"
                  className={
                    publicSignupEnabled
                      ? "btn-secondary px-6 py-3 text-base"
                      : "btn-primary px-6 py-3 text-base"
                  }
                >
                  Accéder à mon inventaire
                  {!publicSignupEnabled ? (
                    <ArrowRight className="ml-2" size={19} />
                  ) : null}
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-muted-foreground">
                {[
                  "Équipes multiples",
                  "Données séparées par concession",
                  "Contrôle humain avant publication",
                ].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <Check className="text-primary" size={16} /> {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-5 rotate-2 rounded-[2.25rem] border border-primary/20 bg-primary/10" />
              <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-lg">
                <div className="flex items-center justify-between border-b border-border px-6 py-5">
                  <div>
                    <p className="brand-label text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      Trajet d’une publication
                    </p>
                    <p className="mt-1 font-bold">Chevrolet Equinox 2024</p>
                  </div>
                  <span className="badge-success">Disponible</span>
                </div>
                <div className="px-6 py-7 sm:px-8">
                  <div className="relative space-y-7 before:absolute before:bottom-5 before:left-[13px] before:top-5 before:w-px before:bg-border">
                    {workflow.map((item) => (
                      <div key={item.label} className="relative flex gap-4">
                        <span
                          className={`relative z-10 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-4 border-card ${item.state === "done" ? "bg-signal" : item.state === "active" ? "bg-primary" : "bg-muted-foreground/40"}`}
                        >
                          {item.state === "done" && (
                            <Check size={13} className="text-white" />
                          )}
                        </span>
                        <div>
                          <p className="font-bold">{item.label}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {item.detail}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-8 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-sidebar p-4 text-sidebar-foreground">
                      <p className="brand-label text-[0.6rem] uppercase tracking-[0.18em] text-sidebar-accent">
                        Photos prêtes
                      </p>
                      <p className="brand-display mt-2 text-3xl font-bold">
                        20
                      </p>
                    </div>
                    <div className="rounded-2xl bg-primary/10 p-4 text-foreground">
                      <p className="brand-label text-[0.6rem] uppercase tracking-[0.18em] text-primary">
                        Temps estimé
                      </p>
                      <p className="brand-display mt-2 text-3xl font-bold">
                        &lt; 2 min
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="brand-label text-xs font-bold uppercase tracking-[0.22em] text-primary">
              Un système, quatre réflexes
            </p>
            <h2 className="brand-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Conçu pour le vrai rythme d’un département des ventes.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Gauge,
                title: "Inventaire synchronisé",
                text: "Repérez immédiatement les véhicules prêts, vendus ou à retirer.",
              },
              {
                icon: Images,
                title: "Fiches complètes",
                text: "Prix, année, description et photos suivent le véhicule jusqu’à Facebook.",
              },
              {
                icon: Users,
                title: "Travail en équipe",
                text: "Ajoutez des représentants et gardez chaque publication liée à la bonne personne.",
              },
              {
                icon: BellRing,
                title: "Suivi actif",
                text: "Recevez les changements importants sans fouiller dans plusieurs systèmes.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <article key={title} className="card p-6">
                <span className="inline-flex rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Icon size={22} />
                </span>
                <h3 className="mt-5 font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {text}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-sidebar px-5 py-14 text-sidebar-foreground lg:px-8">
          <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <p className="brand-label text-xs font-bold uppercase tracking-[0.2em] text-sidebar-accent">
                Prêt à commencer
              </p>
              <h2 className="brand-display mt-2 text-3xl font-bold tracking-tight">
                Votre équipe, votre inventaire, un seul suivi.
              </h2>
            </div>
            <Link
              href={publicSignupEnabled ? "/register" : "/login"}
              className="btn bg-card px-6 py-3 text-foreground hover:bg-muted"
            >
              {publicSignupEnabled ? "Créer un espace" : "Se connecter"}{" "}
              <ArrowRight className="ml-2" size={18} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card px-5 py-8 text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:px-3">
          <BrandMark />
          <p>
            © {new Date().getFullYear()} Suivia. La publication finale demeure
            sous votre contrôle.
          </p>
        </div>
      </footer>
    </div>
  );
}
