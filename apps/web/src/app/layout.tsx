import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OKauto — Marketplace Listing Platform for Dealers',
  description:
    'List and manage dealership inventory on Facebook Marketplace faster: AI descriptions, human-in-the-loop posting, sold alerts, and salesperson analytics.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
