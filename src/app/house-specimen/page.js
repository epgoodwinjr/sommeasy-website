// /house-specimen — every House List primitive on one page, with sample
// content, for checking them against docs/house-list/screenshots before the
// phases build pages from them. Preview deploys and local dev only:
// production 404s. Delete it with the merge (Phase 6).

import { notFound } from "next/navigation";
import Specimen from "./Specimen";

export const metadata = {
  title: "House List — primitives",
  robots: { index: false, follow: false },
};

export default function HouseSpecimenPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <Specimen />;
}
