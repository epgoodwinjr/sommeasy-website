// captcha.js — Cloudflare Turnstile verification, PREPARED but dark.
//
// Session 4 lays the code path; the enable decision is deferred to
// post-launch with Ed (does real signup traffic justify the friction?).
// Everything here is a no-op when NEXT_PUBLIC_CAPTCHA_ENABLED !== "1", so
// nothing breaks while the flag is absent — a caller can gate on
// verifyCaptchaToken today and it will simply pass until the flag flips.
//
// When enabled: the client renders the Turnstile widget with the public
// site key and sends its token; the server verifies the token against
// Cloudflare with TURNSTILE_SECRET_KEY. Missing server secret while enabled
// fails OPEN (logged) rather than locking everyone out on a misconfig — the
// same "never break the funnel" bias as the rest of the auth work.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const CAPTCHA_REQUIRED_MESSAGE =
  "One quick check to prove you're human — tap the box above and try again.";

export function isCaptchaEnabled() {
  return process.env.NEXT_PUBLIC_CAPTCHA_ENABLED === "1";
}

/**
 * Verify a Turnstile token. Returns:
 *   { ok: true, skipped: true }   — feature off (the default today)
 *   { ok: true }                  — token verified
 *   { ok: false, reason }         — enabled + token missing/invalid
 * Never throws; a network/parse failure against Cloudflare fails open with
 * a logged reason so an outage can't wall off signups.
 */
export async function verifyCaptchaToken(token, { remoteIp } = {}) {
  if (!isCaptchaEnabled()) return { ok: true, skipped: true };

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn("[captcha] enabled but TURNSTILE_SECRET_KEY missing — failing open");
    return { ok: true, skipped: true };
  }
  if (!token) return { ok: false, reason: "missing_token" };

  try {
    const form = new URLSearchParams({ secret, response: token });
    if (remoteIp) form.set("remoteip", remoteIp);
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data.success) return { ok: true };
    return { ok: false, reason: (data["error-codes"] || ["rejected"]).join(",") };
  } catch (err) {
    console.warn(`[captcha] verify failed, failing open: ${err?.message || err}`);
    return { ok: true, skipped: true };
  }
}
