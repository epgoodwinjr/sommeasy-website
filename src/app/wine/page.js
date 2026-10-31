import { splitVintage } from "@/lib/vintage";
import WinePage from "./WinePage";

// ?name= is read as a SERVER prop, never useSearchParams (CLAUDE.md: on a
// statically-served page it suspends during hydration and remounts). The
// name is the journal row's key, so it travels byte for byte — no trimming.
function nameFrom(searchParams) {
  const raw = Array.isArray(searchParams?.name) ? searchParams.name[0] : searchParams?.name;
  return typeof raw === "string" ? raw : "";
}

export function generateMetadata({ searchParams }) {
  const { base } = splitVintage(nameFrom(searchParams));
  return {
    title: base ? `${base} — Sommeasy` : "A wine — Sommeasy",
    description: "Your verdict, the Somm’s words and the particulars of one bottle.",
  };
}

// The key remounts the page per wine: /wine?name=A → B is a same-route hop
// that would otherwise keep A's state, and its running head's trail entry.
export default function Wine({ searchParams }) {
  const name = nameFrom(searchParams);
  return <WinePage key={name} name={name} />;
}
