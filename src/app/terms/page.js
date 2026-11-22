import LegalPage from "@/components/house/LegalPage";
import { TERMS } from "@/lib/legalCopy";

export const metadata = { title: "Terms — Sommeasy" };

export default function TermsPage() {
  return <LegalPage copy={TERMS} testId="terms-page" />;
}
