import { createServerClient } from "@supabase/ssr";

/**
 * Supabase server client for Route Handlers that must WRITE auth cookies
 * onto a redirect response (confirm/callback). The redirect destination
 * isn't known until after the auth call, so setAll collects cookies into a
 * buffer and applyCookies() stamps them onto whichever response we build.
 *
 * (The read-only cookies() pattern in palate-narrative can't do this — a
 * plain supabase-js client can't do it at all, which is why every email
 * confirmation dead-ended before this existed.)
 */
export function createRouteClient(request) {
  const pending = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          pending.push(...cookiesToSet);
        },
      },
    }
  );

  const applyCookies = (response) => {
    for (const { name, value, options } of pending) {
      response.cookies.set(name, value, options);
    }
    return response;
  };

  return { supabase, applyCookies };
}
