import type { Metadata } from "next";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenLot — Marketplace listing platform for dealerships",
  description:
    "Import inventory, generate compliant descriptions, assist Marketplace listings, and track salesperson activity — with sold-vehicle alerts built in.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
