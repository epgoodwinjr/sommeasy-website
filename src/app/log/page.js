import { headers } from "next/headers";
import LogBottle from "./LogBottle";

export const metadata = {
  title: "Log a bottle — Sommeasy",
  description: "Snap the label and rate it — every rating sharpens your Wine DNA.",
};

// The same device check home used for its camera button — run here, on the
// request, so the first paint already shows the right camera entry.
const MOBILE_UA = /Mobi|Android|iPhone|iPad|iPod/i;

// ?q= (home's "Name a bottle you already love") opens the search step
// pre-filled. Read as a SERVER prop, never useSearchParams (CLAUDE.md: on a
// statically-served page it suspends during hydration and remounts).
export default function LogPage({ searchParams }) {
  const raw = Array.isArray(searchParams?.q) ? searchParams.q[0] : searchParams?.q;
  const initialQuery = typeof raw === "string" ? raw.trim().slice(0, 120) : "";
  const isMobile = MOBILE_UA.test(headers().get("user-agent") || "");
  return <LogBottle initialQuery={initialQuery} isMobile={isMobile} />;
}
