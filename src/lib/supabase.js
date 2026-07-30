import { createBrowserClient } from "@supabase/ssr";

// Fail LOUD, not silent. The old behavior returned a stub client when the
// NEXT_PUBLIC_SUPABASE_* vars were missing — which meant a misconfigured
// deploy could go green with completely dead auth (sign-in silently no-ops).
// These vars are inlined at build time, so their absence means a real
// configuration error. Throwing here fails the build when the static "/"
// route prerenders (createClient runs during that prerender), so a green
// deploy with dead auth is impossible.
//
// This is not reachable in the browser at runtime: if the build succeeded,
// the values were inlined and are present.
function assertSupabaseEnv(url, key) {
  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing: set NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY. Refusing to build a client with dead " +
      "auth — fix the environment (Vercel project settings / .env.local)."
    );
  }
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assertSupabaseEnv(url, key);
  return createBrowserClient(url, key);
}
