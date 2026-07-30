import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OKauto — Dealership Marketplace Listings",
  description:
    "Human-in-the-loop Facebook Marketplace listing assistant for dealerships. Inventory sync, AI descriptions, salesperson analytics, sold alerts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
