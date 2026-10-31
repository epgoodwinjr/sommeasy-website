// ─────────────────────────────────────────────────────────────────────────
// interaction_count RECOUNT — dry run by default (October 2026).
//
// Before the bottle-count fix, upsertAccumulation moved interaction_count by
// the SIGN of each point delta: +1 on any positive delta, never a −1. So an
// upward re-rate (liked → loved) counted a bottle twice, a journal delete
// never took the bottle back, and reversing a not-for-me bottle (deleting
// it, or re-rating it to fine) ADDED one. Points were always exact; only the
// count drifted.
//
// This script recounts ONE account: every rated wine_interactions row that
// the engine accumulated (stored match_confidence set) is valued with the
// REAL engine's bottleEvidence — what today's engine holds for it, exactly
// once — and the sums are diffed against dna_accumulation. A differing row
// lands in one of two classes:
//
//   count-only    points agree, the count doesn't: the drift the fix stops.
//                 The only class --apply touches.
//   needs-review  the row's POINTS disagree too, so its history isn't
//                 today's engine over today's journal (a seeded fixture,
//                 legacy drift, a resolver change since the rating).
//                 Reported, never written — it needs a per-class decision,
//                 the way Act III S5 reconciled the points.
//
// Usage:
//   BACKFILL_EMAIL=... BACKFILL_PASSWORD=... node scripts/recount-interaction-count.mjs            # dry run
//   BACKFILL_EMAIL=... BACKFILL_PASSWORD=... node scripts/recount-interaction-count.mjs --apply    # Ed's go-ahead only
//
// Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from
// .env.local. Auth is a normal user session (RLS applies — it can only ever
// see the signed-in account). --apply writes interaction_count and nothing
// else (never points, promotions, or the timeline), and every UPDATE asserts
// the row still holds the points and count this run read, so a rating
// landing mid-run turns that write into a no-op instead of clobbering it.
// ─────────────────────────────────────────────────────────────────────────

import { register } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./esm-compat-loader.mjs", import.meta.url);

const { createClient } = await import("@supabase/supabase-js");
const { bottleEvidence } = await import("../src/lib/dnaEvolution.js");
const { confidenceBand } = await import("../src/lib/wineEvents.js");

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
console.log(`Signed in as ${email} (${APPLY ? "APPLY" : "DRY RUN"}) — ${new Date().toISOString()}\n`);

const [{ data: interactions, error: intError }, { data: accumulation, error: accError }] = await Promise.all([
  supabase
    .from("wine_interactions")
    .select("wine_name, rating, match_confidence, resolved_winery, resolved_varietal, resolved_region, resolved_country")
    .eq("user_id", userId)
    .not("rating", "is", null),
  supabase
    .from("dna_accumulation")
    .select("id, dimension, dimension_value, display_name, points, interaction_count, promoted, source")
    .eq("user_id", userId),
]);
if (intError) throw new Error(`wine_interactions read failed: ${intError.message}`);
if (accError) throw new Error(`dna_accumulation read failed: ${accError.message}`);

// ── The recount: what today's engine holds, once per rated bottle ──
const expected = new Map();
const neverResolved = [];
const resolverDrift = [];
let accumulating = 0;
for (const row of interactions) {
  // Never resolved → never accumulated; the reversal skips these too
  if (row.match_confidence == null) {
    const today = bottleEvidence(row.wine_name, row.rating);
    neverResolved.push({ wine: row.wine_name, rating: row.rating, todayBand: confidenceBand(today.resolution.confidence) });
    continue;
  }
  const evidence = bottleEvidence(row.wine_name, row.rating);
  const r = evidence.resolution;
  const stampedBand = confidenceBand(row.match_confidence);
  const todayBand = confidenceBand(r.confidence);
  const stamp = [row.resolved_winery, row.resolved_varietal, row.resolved_region, row.resolved_country];
  const now = [r.winery, r.varietal, r.region, r.country];
  if (stampedBand !== todayBand || stamp.some((v, i) => (v ?? null) !== (now[i] ?? null))) {
    resolverDrift.push({ wine: row.wine_name, stamped: `${stamp.map((v) => v ?? "–").join(" / ")} @ ${row.match_confidence}`,
      today: `${now.map((v) => v ?? "–").join(" / ")} @ ${r.confidence}` });
  }
  if (evidence.dimensions.length > 0) accumulating++;
  for (const dim of evidence.dimensions) {
    const key = `${dim.dimension}:${dim.dimensionValue}`;
    const entry = expected.get(key) || { points: 0, count: 0, displayName: dim.displayName };
    entry.points += evidence.points;
    if (evidence.pushes) entry.count += 1;
    expected.set(key, entry);
  }
}

// ── The diff ──
const countOnly = [];
const needsReview = [];
let unchanged = 0;
const seen = new Set();
for (const row of accumulation) {
  const key = `${row.dimension}:${row.dimension_value}`;
  seen.add(key);
  const want = expected.get(key) || { points: 0, count: 0 };
  if (row.interaction_count === want.count) {
    unchanged++;
    // Points can still disagree with an agreeing count — say so, it's drift
    if (row.points !== want.points) needsReview.push({ row, key, want });
    continue;
  }
  (row.points === want.points ? countOnly : needsReview).push({ row, key, want });
}
// Evidence the recount expects but the ledger has no row for at all
const missing = [...expected].filter(([key, want]) => !seen.has(key) && (want.count !== 0 || want.points !== 0));

const label = ({ row, key }) => `${key} ("${row.display_name}")${row.promoted ? ` [promoted, ${row.source}]` : ""}`;
console.log(`Rated bottles: ${interactions.length} — ${accumulating} accumulating, ${neverResolved.length} never resolved, ` +
  `${interactions.length - accumulating - neverResolved.length} below the partial gate`);
console.log(`Ledger rows: ${accumulation.length} — ${unchanged} count already right, ${countOnly.length} count-only, ` +
  `${needsReview.length} needs-review, ${missing.length} missing\n`);

console.log("count-only — points agree; --apply sets the count:");
if (countOnly.length === 0) console.log("  (none)");
for (const d of countOnly) {
  console.log(`  ${label(d)}  count ${d.row.interaction_count} → ${d.want.count}  (points ${d.row.points}, agree)`);
}
console.log("\nneeds-review — points disagree with the recount; reported, never written:");
if (needsReview.length === 0) console.log("  (none)");
for (const d of needsReview) {
  console.log(`  ${label(d)}  count ${d.row.interaction_count}, recount ${d.want.count}  ·  points ${d.row.points}, recount ${d.want.points}`);
}
if (missing.length > 0) {
  console.log("\nmissing — the recount expects evidence the ledger has no row for (reported, never created):");
  for (const [key, want] of missing) console.log(`  ${key} ("${want.displayName}")  recount ${want.count} bottles / ${want.points} points`);
}
if (resolverDrift.length > 0) {
  console.log("\nresolver drift — the stored stamp differs from today's resolution (the recount follows today's, as a delete would):");
  for (const d of resolverDrift) console.log(`  "${d.wine}"\n      stamped ${d.stamped}\n      today   ${d.today}`);
}
if (neverResolved.length > 0) {
  console.log("\nnever resolved — rated, never accumulated, so they count nowhere:");
  for (const d of neverResolved) console.log(`  "${d.wine}" — ${d.rating} (today's engine: ${d.todayBand} band)`);
}

if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to write the count-only rows.");
  process.exit(0);
}

let written = 0;
for (const d of countOnly) {
  const { data, error } = await supabase
    .from("dna_accumulation")
    .update({ interaction_count: d.want.count })
    .eq("id", d.row.id)
    .eq("interaction_count", d.row.interaction_count)
    .eq("points", d.row.points)
    .select("id");
  if (error) console.log(`  ! ${d.key}: ${error.message}`);
  else if ((data || []).length === 0) console.log(`  ~ ${d.key}: changed since the read — skipped`);
  else written++;
}
console.log(`\nApplied: ${written}/${countOnly.length} count-only rows written. needs-review rows untouched.`);
