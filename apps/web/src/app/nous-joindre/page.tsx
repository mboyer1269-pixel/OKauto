import type { Metadata } from "next";
import { LegalPlaceholderPage } from "@/components/landing/legal-placeholder";
import { landingCopy } from "@/content/landing";

export const metadata: Metadata = {
  title: landingCopy.footer.contact,
};

export default function NousJoindrePage() {
  return <LegalPlaceholderPage title={landingCopy.footer.contact} />;
}
