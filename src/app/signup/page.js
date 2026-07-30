import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Create Account — Sommeasy" };

// searchParams as a server prop — see login/page.js for why.
export default function SignupPage({ searchParams }) {
  return <AuthForm mode="signup" params={searchParams} />;
}
