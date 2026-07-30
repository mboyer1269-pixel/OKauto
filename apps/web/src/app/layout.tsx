import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OKauto — Dealership Marketplace Listings",
  description:
    "List, track, and manage dealership inventory on Facebook Marketplace with human-in-the-loop workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
