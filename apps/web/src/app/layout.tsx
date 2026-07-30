import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LotPilot", template: "%s · LotPilot" },
  description:
    "LotPilot — list, manage, and track dealership inventory on Facebook Marketplace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
