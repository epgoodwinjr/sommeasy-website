import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Must run on every request — a statically prerendered response would never
// touch Supabase and the keep-alive would be a no-op
export const dynamic = "force-dynamic";

// A proper server-side client. This route has no user session — it's a cron
// health ping — so the cookie adapter is a read-nothing/write-nothing no-op
// (using the browser factory here was wrong: it's built for a document
// context, not a Route Handler).
function createHealthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createServerClient(url, key, {
    cookies: { getAll() { return []; }, setAll() {} },
  });
}

// Daily cron target (vercel.json) — a trivial select keeps the free-tier
// Supabase project active so it never auto-pauses again (the March incident:
// paused >90 days, unrecoverable, database rebuilt from scratch).
export async function GET() {
  try {
    const supabase = createHealthClient();
    if (!supabase) {
      console.error("[keepalive] Supabase env vars missing");
      return NextResponse.json({ ok: false, error: "not configured" }, { status: 500 });
    }
    // RLS returns no rows to the anon key — fine, the API touch counts as activity
    const { error } = await supabase
      .from("wine_profiles")
      .select("id", { head: true, count: "exact" });
    if (error) {
      console.error("[keepalive] query error:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ts: new Date().toISOString() });
  } catch (err) {
    console.error("[keepalive] failed:", err?.message || err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
