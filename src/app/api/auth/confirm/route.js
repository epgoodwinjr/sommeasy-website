import { NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabaseRoute";
import { sanitizeNext, isValidOtpType } from "@/lib/authFlow";

export const dynamic = "force-dynamic";

/**
 * Email-link landing: verifies a token_hash minted by the Supabase email
 * templates (`{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}
 * &type=...&next=...`) and establishes the session via cookies on the
 * redirect. Unlike the PKCE ?code= flow, token_hash needs no verifier
 * cookie, so links work in ANY browser — not just the one that signed up.
 *
 * Handles type=signup|recovery|magiclink|email_change (+invite/email).
 * Failures always land on /login with a mapped reason — never a silent
 * bounce.
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // Recovery links exist to reach /update-password; default them there.
  const fallbackNext = type === "recovery" ? "/update-password" : "/";
  const next = sanitizeNext(searchParams.get("next") ?? fallbackNext);

  const failure = (reason) =>
    NextResponse.redirect(`${origin}/login?${new URLSearchParams({ error: reason })}`);

  try {
    // Tolerate a ?code= arriving here (e.g. a redirectTo pointed at this
    // route while the old ConfirmationURL templates are still live).
    const code = searchParams.get("code");
    if (!tokenHash && code) {
      const { supabase, applyCookies } = createRouteClient(request);
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error(`[auth] confirm failed: code exchange: ${error.message}`);
        return failure("exchange_failed");
      }
      return applyCookies(NextResponse.redirect(`${origin}${next}`));
    }

    if (!tokenHash || !isValidOtpType(type)) {
      console.error(
        `[auth] confirm failed: bad params (token_hash=${tokenHash ? "present" : "missing"}, type=${type || "missing"})`
      );
      return failure("link_expired");
    }

    const { supabase, applyCookies } = createRouteClient(request);
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      console.error(`[auth] confirm failed: verifyOtp: ${error.message}`);
      return failure("link_expired");
    }

    return applyCookies(NextResponse.redirect(`${origin}${next}`));
  } catch (err) {
    console.error(`[auth] confirm failed: ${err?.message || err}`);
    return failure("exchange_failed");
  }
}
