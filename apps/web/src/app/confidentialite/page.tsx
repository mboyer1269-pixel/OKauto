import type { Metadata } from "next";
import { LegalPlaceholderPage } from "@/components/landing/legal-placeholder";
import { landingCopy } from "@/content/landing";

export const metadata: Metadata = {
  title: landingCopy.footer.privacy,
};

export default function ConfidentialitePage() {
  return <LegalPlaceholderPage title={landingCopy.footer.privacy} />;
}
