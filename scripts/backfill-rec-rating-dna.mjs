// ─────────────────────────────────────────────────────────────────────────
// ONE-TIME BACKFILL — ALREADY RUN (August 2026, against epgoodwin@gmail.com).
//
// Before WineRecList (The Reveal session, commit e429cfc), the home page's
// Wines-to-Try ratings wrote wine_interactions but never called
// resolveAndAccumulate — so those ratings never fed DNA evolution. This
// script finds rated interactions that never went through the resolver
// (resolved_at IS NULL — every accumulating path stamps it when match
// confidence > 0) and runs the REAL resolveAndAccumulate over them.
//
// Idempotent: a processed row gets resolved_at stamped, so it is no longer
// a candidate on the next run. Wines the resolver can't identify at all
// (confidence 0) stay candidates but every pass is a no-op for them.
//
// Known limitation (checked against the real data before running — no such
// rows existed): a pre-WineRecList rating that was LATER re-rated through
// the journal has resolved_at set but only received the differential
// points; this heuristic will not find it.
//
// Usage:
//   BACKFILL_EMAIL=... BACKFILL_PASSWORD=... node scripts/backfill-rec-rating-dna.mjs            # dry run
//   BACKFILL_EMAIL=... BACKFILL_PASSWORD=... node scripts/backfill-rec-rating-dna.mjs --apply
//
// Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from
// .env.local. Auth is a normal user session (RLS applies) — the account
// owner's credentials, supplied via env, never stored here.
// ─────────────────────────────────────────────────────────────────────────

import { register } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./esm-compat-loader.mjs", import.meta.url);

const { createClient } = await import("@supabase/supabase-js");
const { resolveAndAccumulate } = await import("../src/lib/dnaEvolution.js");
const { resolveWine } = await import("../src/lib/wineResolver.js");

const APPLY = process.argv.includes("--apply");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env.local (same minimal parser as playwright.config.ts)
const envPath = path.resolve(__dirname, "..", ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  if (!process.env[key]) process.env[key] = trimmed.slice(eqIdx + 1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.BACKFILL_EMAIL;
const password = process.env.BACKFILL_PASSWORD;
if (!url || !anonKey) throw new Error("Missing Supabase env vars in .env.local");
if (!email || !password) throw new Error("Set BACKFILL_EMAIL and BACKFILL_PASSWORD (the account owner's credentials)");

const supabase = createClient(url, anonKey);
const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) throw new Error(`Sign-in failed: ${authError.message}`);
const userId = authData.user.id;
console.log(`Signed in as ${email} (${APPLY ? "APPLY" : "DRY RUN"})\n`);

async function snapshotAccumulation() {
  const { data } = await supabase
    .from("dna_accumulation")
    .select("dimension, dimension_value, display_name, points, interaction_count, promoted, source")
    .eq("user_id", userId);
  const map = new Map();
  for (const r of data || []) map.set(`${r.dimension}:${r.dimension_value}`, r);
  return map;
}

// Candidates: rated, never stamped by the resolver
const { data: interactions, error } = await supabase
  .from("wine_interactions")
  .select("wine_name, rating, updated_at, resolved_at")
  .eq("user_id", userId)
  .not("rating", "is", null)
  .is("resolved_at", null)
  .order("updated_at", { ascending: true });
if (error) throw new Error(`Fetch failed: ${error.message}`);

if (!interactions || interactions.length === 0) {
  console.log("No candidates — every rated interaction has already been through the resolver.");
  process.exit(0);
}

console.log(`${interactions.length} candidate(s):\n`);
for (const i of interactions) {
  const r = resolveWine(i.wine_name);
  const dims = [
    r.winery && `estate:${r.winery}`,
    r.varietal && !r.isBlend && `varietal:${r.varietal}`,
    r.region && `region:${r.region}`,
    r.country && `country:${r.country}`,
  ].filter(Boolean).join(", ");
  console.log(`  "${i.wine_name}" — ${i.rating} (${i.updated_at})`);
  console.log(`      resolver confidence ${r.confidence}${r.confidence >= 80 ? "" : " (below gate — will not accumulate)"}${dims ? ` → ${dims}` : ""}`);
}

if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to write.");
  process.exit(0);
}

const before = await snapshotAccumulation();
const allPromotions = [];
const allDemotions = [];
for (const i of interactions) {
  const result = await resolveAndAccumulate(supabase, userId, i.wine_name, i.rating, null);
  allPromotions.push(...(result.promotions || []));
  allDemotions.push(...(result.demotions || []));
}
const after = await snapshotAccumulation();

console.log("\nAccumulation diff:");
let touched = 0;
for (const [key, row] of after) {
  const prev = before.get(key);
  if (!prev) {
    touched++;
    console.log(`  + ${key} ("${row.display_name}") points ${row.points}, interactions ${row.interaction_count}${row.promoted ? " [PROMOTED]" : ""}`);
  } else if (prev.points !== row.points || prev.promoted !== row.promoted) {
    touched++;
    console.log(`  ~ ${key} ("${row.display_name}") points ${prev.points} → ${row.points}${prev.promoted !== row.promoted ? `, promoted ${prev.promoted} → ${row.promoted}` : ""}`);
  }
}
if (touched === 0) console.log("  (none)");
console.log(`\nPromotions triggered: ${allPromotions.length ? allPromotions.map((p) => `${p.dimension}:${p.dimensionValue}`).join(", ") : "none"}`);
console.log(`Demotions triggered: ${allDemotions.length ? allDemotions.map((d) => `${d.dimension}:${d.dimensionValue}`).join(", ") : "none"}`);
console.log("\nDone. Rows processed are now stamped resolved_at — re-running is a no-op.");
