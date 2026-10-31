// POST /api/account/delete — Account › Delete account (The House List §10.2).
//
// Deletes the signed-in user's auth record through the admin API; every
// user table (wine_profiles, wine_interactions, dna_accumulation,
// dna_timeline, wine_events) cascades from auth.users, and user_roster
// follows. The owner's wine_events rows going with it is the one sanctioned
// exception to append-forever: the database does it — no DELETE policy is
// added, for anyone.
//
// The user id comes ONLY from the cookie session; the body is never read,
// so a request naming someone else deletes no one but its own owner. The
// service key is server-only (never NEXT_PUBLIC_) and rides the admin call
// alone. Success clears the session cookies on the response; any failure
// keeps the session so the user can try again.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteClient } from "@/lib/supabaseRoute";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { authErrorCopy } from "@/lib/authCopy";

export const dynamic = "force-dynamic";

const fail = (key, status, headers) => NextResponse.json({ error: authErrorCopy(key) }, { status, headers });

export async function POST(request) {
  const rate = checkRateLimit("account-delete", getClientIp(request));
  if (!rate.allowed) {
    return fail("rate_limit", 429, { "Retry-After": String(rate.retryAfterSec) });
  }

  const { supabase, applyCookies } = createRouteClient(request);
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    user = null;
  }
  if (!user?.id) return fail("session_missing", 401);

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error("[account] delete failed: no_service_key");
    return fail("account_delete_failed", 503);
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let error = null;
  try {
    ({ error } = await admin.auth.admin.deleteUser(user.id));
  } catch (err) {
    error = err;
  }
  if (error) {
    // The reason, never the user: a code or status, not an email or id
    const reason = error.code || error.status || error.name || "unknown";
    console.error(`[account] delete failed: ${reason}`);
    return fail("account_delete_failed", 500);
  }

  console.log("[account] delete ok");
  // The auth record is gone; clear the cookie session. A deleted user's
  // logout may answer 401/403/404 — supabase-js removes the session anyway
  try {
    await supabase.auth.signOut();
  } catch {
    // The account is deleted either way; the client signs out locally too
  }
  return applyCookies(NextResponse.json({ ok: true }));
}
