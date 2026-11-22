import LegalPage from "@/components/house/LegalPage";
import { PRIVACY } from "@/lib/legalCopy";

export const metadata = { title: "Privacy — Sommeasy" };

export default function PrivacyPage() {
  return <LegalPage copy={PRIVACY} testId="privacy-page" />;
}
