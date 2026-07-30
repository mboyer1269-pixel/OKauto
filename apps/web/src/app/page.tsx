"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";

export default function LandingPage() {
  const { loading, user } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
        Open-source dealer listing platform
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
        List inventory on Marketplace <span className="text-indigo-600">in minutes</span>, not hours.
      </h1>
      <p className="mt-4 max-w-2xl text-base text-slate-500">
        OpenLot imports your inventory, generates compliant descriptions, assists your team through Marketplace
        listings with a Chrome extension, and alerts salespeople the moment a vehicle sells — so buyers never see
        stale listings.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/register"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-700"
        >
          Create your dealership
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Sign in
        </Link>
      </div>
      <div className="mt-12 grid w-full grid-cols-1 gap-4 text-left sm:grid-cols-3">
        {[
          ["Inventory sync", "CSV imports and scheduled website/DMS feeds with VIN validation, price history and sold detection."],
          ["Human-in-the-loop listing", "The extension pre-fills the Marketplace form; your salesperson reviews and publishes. No bots, no ToS violations."],
          ["Team accountability", "Per-salesperson activity, sold alerts, stale-listing reminders and a full audit trail."],
        ].map(([title, body]) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-800">{title}</div>
            <div className="mt-1 text-xs leading-relaxed text-slate-500">{body}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
