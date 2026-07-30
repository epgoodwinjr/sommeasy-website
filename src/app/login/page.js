import AuthForm from "@/components/AuthForm";

export const metadata = {
  title: "Sign In — Sommeasy",
  description: "Sign in to your Wine DNA — your palate, your journal, and picks from any restaurant wine list.",
};

// searchParams as a server prop (not useSearchParams in the client): a
// statically-served page + useSearchParams suspends during hydration and
// REMOUNTS the form — wiping anything typed into the pre-hydration DOM.
// Server-rendering the params costs nothing here and kills that race.
export default function LoginPage({ searchParams }) {
  return <AuthForm mode="login" params={searchParams} />;
}
