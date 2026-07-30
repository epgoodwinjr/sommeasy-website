// Central brand-voice copy for every auth state. This is the single source
// of truth — no component or route renders a raw Supabase error string.
// Voice per CLAUDE.md: warm, confident, no jargon, always a next step.
// Dependency-free so unit tests exercise the real module.

export const AUTH_ERRORS = {
  wrong_credentials:
    "That email and password don't match our books. Give it another try — or reset your password below if it's slipped your mind.",
  unconfirmed_email:
    "Almost there — your email hasn't been confirmed yet. Check your inbox for our note, and we'll get you in.",
  rate_limit:
    "Easy does it — that's a few requests in quick succession. Give it a minute, then try again.",
  network:
    "We couldn't reach our cellar just now — check your connection and try again.",
  link_expired:
    "That link has expired or already been used — they don't keep long. Try signing in below, or reset your password for a fresh one.",
  exchange_failed:
    "We couldn't finish signing you in from that link. Try it once more, or sign in below with your email and password.",
  already_registered:
    "Good news — you already have an account with us. Sign in instead, or reset your password if it's slipped your mind.",
  weak_password:
    "That password's a touch short — give it at least 8 characters.",
  same_password:
    "That's the password you already have — pick something new.",
  magic_needs_email:
    "Tell us your email first — type it above and we'll send the link there.",
  unknown:
    "Something went sideways on our end. Give it a moment, then try again.",
};

// Non-error states, kept here so the whole auth vocabulary lives in one file.
export const AUTH_MESSAGES = {
  check_inbox_title: "Check your inbox",
  check_inbox: (email) =>
    `We've sent a confirmation link to ${email}. Click it and your palate awaits. If it's playing hard to get, check your spam folder.`,
  resent: "A fresh link is on its way — check your inbox.",
  reset_sent:
    "If that email has an account with us, a reset link is on its way. Check your inbox.",
  // Anti-enumeration by construction: the no-account case lands on the SAME
  // copy as the success case, so the form never confirms whether an email
  // has an account.
  magic_sent: (email) =>
    `If that email has an account with us, a sign-in link is on its way to ${email}. If it's playing hard to get, check your spam folder.`,
  password_helper: "At least 8 characters.",
  password_updated: "Your password is updated — welcome back.",
  reset_session_missing:
    "This page needs a fresh reset link to work its magic. Request one below and click it from your inbox.",
};

/**
 * Map a Supabase auth error (or a thrown fetch failure) to a copy key in
 * AUTH_ERRORS. Never returns raw provider text — unknown shapes land on
 * the generic key.
 */
export function mapAuthError(error) {
  if (!error) return null;
  const message = String(error.message || "");
  const status = Number(error.status) || 0;

  if (/invalid login credentials/i.test(message)) return "wrong_credentials";
  if (/email not confirmed/i.test(message)) return "unconfirmed_email";
  if (status === 429 || /for security purposes/i.test(message) || /rate limit/i.test(message)) {
    return "rate_limit";
  }
  if (
    error.name === "AuthRetryableFetchError" ||
    /failed to fetch|network|fetch failed|load failed/i.test(message)
  ) {
    return "network";
  }
  if (/expired|invalid/i.test(message) && /link|token|otp/i.test(message)) {
    return "link_expired";
  }
  if (/password should be at least|password.*too short|weak.?password/i.test(message)) {
    return "weak_password";
  }
  if (/different from the old password/i.test(message)) {
    return "same_password";
  }
  return "unknown";
}

/** Copy for a mapped key; always returns something renderable. */
export function authErrorCopy(key) {
  return AUTH_ERRORS[key] || AUTH_ERRORS.unknown;
}
