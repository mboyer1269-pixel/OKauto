import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { ThemedBrandLockup } from "@/components/themed-brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { landingCopy } from "@/content/landing";
import { LandingJourney } from "./journey";

export function LandingHomePage() {
  const { hero, features, access, footer, nav } = landingCopy;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <ThemedBrandLockup />
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link
              href="#acces"
              className="hidden text-sm font-semibold text-primary hover:underline sm:inline dark:text-brand-cyan"
            >
              {nav.request}
            </Link>
            <Link
              href="/login"
              className="btn-secondary shrink-0 whitespace-nowrap text-sm"
            >
              {nav.login}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-sidebar px-5 py-16 text-sidebar-foreground lg:px-8 lg:py-24">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,hsl(188_83%_51%/0.18),transparent_42%)]" />
          <div className="relative mx-auto max-w-3xl">
            <p className="brand-label text-xs font-bold uppercase tracking-[0.22em] text-brand-cyan">
              {hero.kicker}
            </p>
            <h1 className="brand-display mt-5 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              {hero.title}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-sidebar-foreground/75 sm:text-lg">
              {hero.lede}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="btn-primary px-6 py-3 text-base">
                {hero.loginCta} <ArrowRight className="ml-2" size={18} />
              </Link>
              <Link
                href="#acces"
                className="btn border border-white/15 bg-white/5 px-6 py-3 text-base text-sidebar-foreground hover:bg-white/10"
              >
                {hero.requestCta}
              </Link>
            </div>
          </div>
        </section>

        <LandingJourney />

        <section className="mx-auto max-w-6xl px-5 py-16 lg:px-8 lg:py-20">
          <p className="brand-label text-xs font-bold uppercase tracking-[0.22em] text-primary">
            {features.kicker}
          </p>
          <h2 className="brand-display mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            {features.title}
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {features.items.map((item) => (
              <article key={item.title} className="card">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.text}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="acces"
          className="border-t border-border bg-muted/40 px-5 py-16 lg:px-8"
        >
          <div className="mx-auto max-w-3xl">
            <p className="brand-label text-xs font-bold uppercase tracking-[0.22em] text-primary">
              {access.kicker}
            </p>
            <h2 className="brand-display mt-3 text-3xl font-bold tracking-tight">
              {access.title}
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              {access.text}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/login" className="btn-primary px-6 py-3">
                {access.loginCta}
              </Link>
              <span className="inline-flex items-start gap-2 text-sm text-muted-foreground">
                <Check size={16} className="mt-0.5 text-primary" />
                {access.closedNote}
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-8 text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:px-3">
          <ThemedBrandLockup className="opacity-90" />
          <p>
            © {new Date().getFullYear()} Suivia. {footer.note}
          </p>
        </div>
      </footer>
    </div>
  );
}
