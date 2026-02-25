import { createBrowserClient } from "@supabase/ssr";

let client = null;

export function createClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // During build/SSG, env vars may not be available
  if (!url || !key) {
    // Return a stub that won't crash during prerendering
    return {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: async () => ({ error: { message: "Not initialized" } }),
        signUp: async () => ({ error: { message: "Not initialized" } }),
        signInWithOAuth: async () => ({ error: { message: "Not initialized" } }),
        signOut: async () => ({}),
      },
      from: () => ({
        upsert: async () => ({ error: { message: "Not initialized" } }),
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      }),
    };
  }

  client = createBrowserClient(url, key);
  return client;
}
