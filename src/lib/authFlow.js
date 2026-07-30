// Pure decision logic for the auth flows — no imports, so unit tests run
// against the real module (same pattern as sommPicks.js).

/**
 * Validate a post-auth redirect target. Kills the open redirect: the result
 * is always a same-origin path. Rules (brief §4.1): must start with a single
 * "/", reject "//" and "/\", reject anything containing "\" or ":", and
 * reject control characters. Anything else falls back to "/".
 */
export function sanitizeNext(next) {
  if (typeof next !== "string" || next.length === 0) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//")) return "/";
  if (next.includes("\\")) return "/";
  if (next.includes(":")) return "/";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(next)) return "/";
  return next;
}

/**
 * Interpret a supabase.auth.signUp() result. Supabase anti-enumeration
 * returns fake success for an already-registered email — the tell is
 * user.identities === [] — and if confirmations are ever disabled the
 * session arrives immediately. Callers must branch on all four outcomes.
 *
 * Returns one of:
 *   { kind: "error", error }            — signUp returned an error
 *   { kind: "signed_in" }               — session present, go straight in
 *   { kind: "already_registered" }      — fake success; no email will come
 *   { kind: "check_email" }             — real signup, confirmation sent
 */
export function interpretSignUpResult(data, error) {
  if (error) return { kind: "error", error };
  if (data?.session) return { kind: "signed_in" };
  const identities = data?.user?.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    return { kind: "already_registered" };
  }
  if (data?.user) return { kind: "check_email" };
  return { kind: "error", error: { message: "empty signUp response" } };
}

/** OTP types the confirm route accepts from email links. */
export const VALID_OTP_TYPES = ["signup", "recovery", "magiclink", "email_change", "invite", "email"];

export function isValidOtpType(type) {
  return VALID_OTP_TYPES.includes(type);
}
