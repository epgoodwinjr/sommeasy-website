import AuthForm from "@/components/AuthForm";

export const metadata = {
  title: "Create Account — Sommeasy",
  description: "Create your free account to save your Wine DNA, rate bottles, and get picks matched to your taste from any wine list.",
};

// searchParams as a server prop — see login/page.js for why.
export default function SignupPage({ searchParams }) {
  return <AuthForm mode="signup" params={searchParams} />;
}
