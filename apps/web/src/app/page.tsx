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
  return (
    <div className="min-h-screen bg-[#f6faff] text-slate-950">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <BrandMark />
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="btn-secondary">
              Se connecter
            </Link>
            <Link
              href="/register"
              className="btn-primary hidden sm:inline-flex"
            >
              Créer un espace
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-slate-200">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(57,189,248,0.18),transparent_34%),linear-gradient(135deg,#f8fbff_0%,#eef7ff_100%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:py-24">
            <div>
              <p className="brand-label mb-5 text-xs font-bold uppercase tracking-[0.22em] text-brand-700">
                Centre de publication automobile
              </p>
              <h1 className="brand-display max-w-3xl text-5xl font-black leading-[0.97] tracking-[-0.055em] text-[#07182d] sm:text-6xl lg:text-7xl">
                Chaque véhicule.
                <br />
                <span className="text-brand-600">Toujours suivi.</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600">
                Suivia Auto rassemble l’inventaire, les photos, les descriptions
                et le suivi des publications dans un espace partagé par toute
                votre équipe.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="btn-primary px-6 py-3 text-base"
                >
                  Créer mon espace <ArrowRight className="ml-2" size={19} />
                </Link>
                <Link
                  href="/login"
                  className="btn-secondary px-6 py-3 text-base"
                >
                  Accéder à mon inventaire
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-slate-600">
                {[
                  "Équipes multiples",
                  "Données séparées par concession",
                  "Contrôle humain avant publication",
                ].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <Check className="text-brand-600" size={16} /> {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-5 rotate-2 rounded-[2.25rem] border border-brand-200 bg-brand-100/50" />
              <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_30px_80px_-35px_rgba(7,24,45,0.45)]">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                  <div>
                    <p className="brand-label text-[0.65rem] font-bold uppercase tracking-[0.2em] text-slate-400">
                      Trajet d’une publication
                    </p>
                    <p className="mt-1 font-bold text-slate-950">
                      Chevrolet Equinox 2024
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                    Disponible
                  </span>
                </div>
                <div className="px-6 py-7 sm:px-8">
                  <div className="relative space-y-7 before:absolute before:bottom-5 before:left-[13px] before:top-5 before:w-px before:bg-slate-200">
                    {workflow.map((item) => (
                      <div key={item.label} className="relative flex gap-4">
                        <span
                          className={`relative z-10 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-4 border-white ${item.state === "done" ? "bg-emerald-500" : item.state === "active" ? "bg-brand-500 shadow-[0_0_0_5px_rgba(14,145,232,0.14)]" : "bg-slate-300"}`}
                        >
                          {item.state === "done" && (
                            <Check size={13} className="text-white" />
                          )}
                        </span>
                        <div>
                          <p className="font-bold text-slate-950">
                            {item.label}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {item.detail}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-8 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-[#07182d] p-4 text-white">
                      <p className="brand-label text-[0.6rem] uppercase tracking-[0.18em] text-sky-300">
                        Photos prêtes
                      </p>
                      <p className="brand-display mt-2 text-3xl font-black">
                        20
                      </p>
                    </div>
                    <div className="rounded-2xl bg-brand-50 p-4 text-brand-950">
                      <p className="brand-label text-[0.6rem] uppercase tracking-[0.18em] text-brand-700">
                        Temps estimé
                      </p>
                      <p className="brand-display mt-2 text-3xl font-black">
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
            <p className="brand-label text-xs font-bold uppercase tracking-[0.22em] text-brand-700">
              Un système, quatre réflexes
            </p>
            <h2 className="brand-display mt-3 text-3xl font-black tracking-[-0.035em] text-[#07182d] sm:text-4xl">
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
              <article
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <span className="inline-flex rounded-xl bg-brand-50 p-2.5 text-brand-700">
                  <Icon size={22} />
                </span>
                <h3 className="mt-5 font-bold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-[#07182d] px-5 py-14 text-white lg:px-8">
          <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <p className="brand-label text-xs font-bold uppercase tracking-[0.2em] text-sky-300">
                Prêt à commencer
              </p>
              <h2 className="brand-display mt-2 text-3xl font-black tracking-tight">
                Votre équipe, votre inventaire, un seul suivi.
              </h2>
            </div>
            <Link
              href="/register"
              className="btn bg-white px-6 py-3 text-[#07182d] hover:bg-sky-50"
            >
              Créer un espace <ArrowRight className="ml-2" size={18} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-5 py-8 text-sm text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:px-3">
          <BrandMark />
          <p>
            © {new Date().getFullYear()} Suivia Auto. La publication finale
            demeure sous votre contrôle.
          </p>
        </div>
      </footer>
    </div>
  );
}
