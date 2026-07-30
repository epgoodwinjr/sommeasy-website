import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

/**
 * Standard @supabase/ssr session refresh. getUser() renews an expired
 * access token and setAll writes the ROTATED refresh token back to the
 * browser — without this, any server-side refresh silently discards the
 * new refresh token and the session dies at random ("Invalid Refresh
 * Token: Refresh Token Not Found").
 */
export async function middleware(request) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response; // build/preview without env — do nothing

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|txt|xml|map)$).*)",
  ],
};
