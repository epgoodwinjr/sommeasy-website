import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export const metadata = { title: "Reset Password — Sommeasy" };

// searchParams as a server prop — see login/page.js for why.
export default function ForgotPasswordPage({ searchParams }) {
  return <ForgotPasswordForm params={searchParams} />;
}
