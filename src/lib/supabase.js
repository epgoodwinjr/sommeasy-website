import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // During build/SSG, env vars may not be available yet
  if (!url || !key) {
    return {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: async () => ({ error: { message: "Supabase not configured — check environment variables in Vercel" } }),
        signUp: async () => ({ error: { message: "Supabase not configured — check environment variables in Vercel" } }),
        signInWithOAuth: async () => ({ error: { message: "Supabase not configured — check environment variables in Vercel" } }),
        signOut: async () => ({}),
      },
      from: () => ({
        upsert: async () => ({ error: { message: "Supabase not configured" } }),
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      }),
    };
  }

  return createBrowserClient(url, key);
}
