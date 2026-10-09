import Link from "next/link";
import { ThemedBrandLockup } from "@/components/themed-brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { landingCopy } from "@/content/landing";

export function LegalPlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 lg:px-8">
          <Link href="/" aria-label={landingCopy.meta.title}>
            <ThemedBrandLockup />
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-16">
        <h1 className="brand-display text-3xl font-bold tracking-tight">
          {title}
        </h1>
        <p className="mt-4 text-muted-foreground">
          {landingCopy.legal.preparing}
        </p>
      </main>
    </div>
  );
}
