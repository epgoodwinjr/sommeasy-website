import { NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabaseRoute";
import { sanitizeNext } from "@/lib/authFlow";

export const dynamic = "force-dynamic";

/**
 * PKCE exchange landing: OAuth returns, and the current-era email links
 * (ConfirmationURL templates 303 here with ?code=). The exchange needs the
 * PKCE verifier cookie written by the browser that initiated the flow, so
 * this path is same-browser only — the token_hash confirm route is the
 * cross-browser one. Session cookies are written onto the redirect.
 *
 * Failures always land on /login with a mapped reason — never a silent
 * bounce (the old ?error=auth that nothing rendered is gone).
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));

  const failure = (reason) =>
    NextResponse.redirect(`${origin}/login?${new URLSearchParams({ error: reason })}`);

  try {
    // Supabase/OAuth can land here with an error instead of a code
    // (declined consent, expired verify link, misconfigured provider).
    const providerError = searchParams.get("error");
    if (providerError) {
      const errorCode = searchParams.get("error_code") || "";
      const detail = searchParams.get("error_description") || providerError;
      console.error(`[auth] callback failed: provider: ${errorCode || providerError}: ${detail}`);
      return failure(errorCode === "otp_expired" ? "link_expired" : "exchange_failed");
    }

    if (!code) {
      console.error("[auth] callback failed: no code param");
      return failure("exchange_failed");
    }

    const { supabase, applyCookies } = createRouteClient(request);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error(`[auth] callback failed: exchange: ${error.message}`);
      return failure("exchange_failed");
    }

    return applyCookies(NextResponse.redirect(`${origin}${next}`));
  } catch (err) {
    console.error(`[auth] callback failed: ${err?.message || err}`);
    return failure("exchange_failed");
  }
}
