import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

// Must run on every request — a statically prerendered response would never
// touch Supabase and the keep-alive would be a no-op
export const dynamic = "force-dynamic";

// Daily cron target (vercel.json) — a trivial select keeps the free-tier
// Supabase project active so it never auto-pauses again (the March incident:
// paused >90 days, unrecoverable, database rebuilt from scratch).
export async function GET() {
  try {
    const supabase = createClient();
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
