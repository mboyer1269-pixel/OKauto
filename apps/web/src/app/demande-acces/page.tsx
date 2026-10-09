import type { Metadata } from "next";
import Link from "next/link";
import { ThemedBrandLockup } from "@/components/themed-brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { accessRequestCopy, accessRequestHrefs } from "@/content/access-request";
import { landingCopy } from "@/content/landing";
import { AccessRequestForm } from "./access-request-form";

export const metadata: Metadata = {
  title: accessRequestCopy.title,
};

export default function DemandeAccesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 lg:px-8">
          <Link href="/" aria-label={landingCopy.meta.title}>
            <ThemedBrandLockup />
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href={accessRequestHrefs.login}
              className="text-sm font-semibold text-primary hover:underline dark:text-brand-cyan"
            >
              {accessRequestCopy.login}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-12">
        <h1 className="brand-display text-3xl font-bold tracking-tight">
          {accessRequestCopy.title}
        </h1>
        <p className="mt-3 text-muted-foreground">{accessRequestCopy.lede}</p>
        <div className="mt-8">
          <AccessRequestForm />
        </div>
      </main>
    </div>
  );
}
