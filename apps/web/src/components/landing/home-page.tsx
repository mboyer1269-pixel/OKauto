import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ThemedBrandLockup } from "@/components/themed-brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { landingCopy, landingHrefs } from "@/content/landing";
import { LandingJourney } from "./journey";

export function LandingHomePage() {
  const { hero, team, carfax, cta, footer, nav } = landingCopy;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 lg:px-8">
          <ThemedBrandLockup />
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <Link
              href={landingHrefs.login}
              className="shrink-0 whitespace-nowrap text-sm font-semibold text-primary hover:underline dark:text-brand-cyan"
            >
              {nav.login}
            </Link>
            <Link
              href={landingHrefs.createSpace}
              className="btn-primary shrink-0 whitespace-nowrap px-3 py-2 text-xs sm:px-4 sm:text-sm"
            >
              {nav.create}
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
              <Link
                href={landingHrefs.createSpace}
                className="btn-primary px-6 py-3 text-base"
              >
                {hero.primary} <ArrowRight className="ml-2" size={18} />
              </Link>
              <Link
                href={landingHrefs.journey}
                className="btn border border-white/15 bg-white/5 px-6 py-3 text-base text-sidebar-foreground hover:bg-white/10"
              >
                {hero.secondary}
              </Link>
            </div>
          </div>
        </section>

        <LandingJourney />

        <section className="mx-auto max-w-3xl px-5 py-16 lg:px-8 lg:py-20">
          <h2 className="brand-display text-3xl font-bold tracking-tight sm:text-4xl">
            {team.title}
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            {team.text}
          </p>
        </section>

        <section className="border-y border-border bg-muted/40 px-5 py-10 lg:px-8">
          <p className="mx-auto max-w-3xl text-base font-medium">
            <Link
              href={landingHrefs.contact}
              className="text-foreground underline-offset-4 hover:underline"
            >
              {carfax}
            </Link>
          </p>
        </section>

        <section
          id="acces"
          className="bg-sidebar px-5 py-16 text-sidebar-foreground lg:px-8 lg:py-20"
        >
          <div className="mx-auto max-w-3xl">
            <h2 className="brand-display text-3xl font-bold tracking-tight sm:text-4xl">
              {cta.title}
            </h2>
            <Link
              href={landingHrefs.createSpace}
              className="btn-primary mt-8 inline-flex px-6 py-3 text-base"
            >
              {cta.button} <ArrowRight className="ml-2" size={18} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-8 text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:px-3">
          <ThemedBrandLockup className="opacity-90" />
          <p>{footer.copyright}</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href={landingHrefs.privacy} className="hover:text-foreground">
              {footer.privacy}
            </Link>
            <Link href={landingHrefs.terms} className="hover:text-foreground">
              {footer.terms}
            </Link>
            <Link href={landingHrefs.contact} className="hover:text-foreground">
              {footer.contact}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
