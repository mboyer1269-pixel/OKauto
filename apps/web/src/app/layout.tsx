import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  title: "Suivia Auto — Inventaire et publications automobiles",
  description:
    "Suivez votre inventaire, préparez vos publications et travaillez efficacement en équipe.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr-CA">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
