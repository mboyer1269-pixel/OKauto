import type { Metadata } from "next";
import Link from "next/link";
import { ThemedBrandLockup } from "@/components/themed-brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { invitationCopy } from "@/content/invitation";
import { landingCopy } from "@/content/landing";
import { InvitationForm } from "./invitation-form";

export const metadata: Metadata = {
  title: invitationCopy.title,
};

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

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
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-12">
        <h1 className="brand-display text-3xl font-bold tracking-tight">
          {invitationCopy.title}
        </h1>
        <p className="mt-3 text-muted-foreground">{invitationCopy.lede}</p>
        <div className="card mt-8 p-6">
          <InvitationForm token={token} />
        </div>
      </main>
    </div>
  );
}
