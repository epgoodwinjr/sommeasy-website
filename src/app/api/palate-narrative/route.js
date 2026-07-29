import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit, getClientIp, logClaudeUsage, RATE_LIMIT_MESSAGE } from "@/lib/rateLimit";
import { CLAUDE_MODEL } from "@/lib/anthropicConfig";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// The evolving narrative (Palate Act II, Pillar 5) is progressive
// enhancement: ANY failure here — no session, fresh narrative, timeout,
// malformed output — returns { fallback: true } and the client keeps the
// narrative it already has. The Palate must be complete without this route.
const fallback = () => NextResponse.json({ fallback: true });

const MIN_CHARS = 200;
const MAX_CHARS = 900;
const STALE_RATED_COUNT = 5;

const SYSTEM_PROMPT = `You are The Somm — Sommeasy's sommelier voice. Confident but not pretentious, warm and conversational, zero gatekeeping jargon. You are rewriting one thing: the user's palate narrative — the short paragraph on their Palate page that describes who they are as a wine drinker.

You receive JSON with:
- "archetype": their palate archetype name.
- "dna": their current DNA — countries, regions, grapes, estates. Items marked (earned) were added by real rated bottles, not the quiz — that's growth worth acknowledging.
- "recentEvolution": what was promoted into or rotated out of their DNA lately, if anything.
- "loved" / "notForMe": bottles they actually rated. The strongest signal you have.
- "redCount" / "whiteCount": their red/white lean.
- "previousNarrative": what you wrote last time.

Write the new narrative:
- 3 to 5 sentences, between 300 and 800 characters. One paragraph, no headings, no markdown.
- Specific to THIS palate — name their places, grapes, or estates. Never invent bottles, places, or facts not in the data.
- Let it feel alive: if something was earned or recently evolved, weave that motion in naturally. If their ratings sharpen a pattern the quiz only hinted at, say so.
- Keep continuity with previousNarrative where it still rings true — this is an evolution, not a rewrite from zero.

Output ONLY a JSON object, no prose before or after: {"narrative": "<the paragraph>"}`;

function createSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {}, // this route only reads the session
      },
    }
  );
}

/** Clip to the cap at a sentence boundary — same salvage idea as somm-picks. */
function clipNarrative(text) {
  if (text.length <= MAX_CHARS) return text;
  const head = text.slice(0, MAX_CHARS);
  const lastStop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (lastStop > MAX_CHARS * 0.4) return head.slice(0, lastStop + 1);
  return head.replace(/[,;:\s]+$/, "") + "…";
}

function validateNarrative(parsed) {
  if (!parsed || typeof parsed !== "object") return { valid: false, reason: "not an object" };
  if (typeof parsed.narrative !== "string") return { valid: false, reason: "narrative not a string" };
  const narrative = clipNarrative(parsed.narrative.trim().replace(/\s+/g, " "));
  if (narrative.length < MIN_CHARS) return { valid: false, reason: `narrative too short (${narrative.length})` };
  if (/[{}<>#*`]/.test(narrative)) return { valid: false, reason: "narrative contains markup" };
  return { valid: true, narrative };
}

function extractJson(text) {
  return (text || "").replace(/```json\n?|```\n?/g, "").trim();
}

export async function POST(request) {
  const rate = checkRateLimit("palate-narrative", getClientIp(request));
  if (!rate.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback();

  try {
    const supabase = createSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fallback();

    const { data: profile } = await supabase
      .from("wine_profiles")
      .select("archetype, narrative, narrative_updated_at, created_at, red_count, white_count")
      .eq("user_id", user.id)
      .single();
    if (!profile || !profile.narrative) return fallback();

    // Staleness gate: a promotion/demotion since the narrative was written,
    // or ≥5 newly rated bottles. Otherwise the current narrative stands.
    const baseline = profile.narrative_updated_at || profile.created_at;
    const [timelineRes, ratedRes] = await Promise.all([
      supabase.from("dna_timeline").select("event_type, display_name, dimension, event_at")
        .eq("user_id", user.id).gt("event_at", baseline)
        .order("event_at", { ascending: false }).limit(10),
      supabase.from("wine_interactions").select("wine_name, rating, updated_at")
        .eq("user_id", user.id).not("rating", "is", null).gt("updated_at", baseline),
    ]);
    const recentEvents = timelineRes.data || [];
    const newlyRated = ratedRes.data || [];
    if (recentEvents.length === 0 && newlyRated.length < STALE_RATED_COUNT) {
      return fallback();
    }

    // Build the payload from stored display names — no wineUnified needed
    const [accRes, feedbackRes] = await Promise.all([
      supabase.from("dna_accumulation").select("dimension, display_name, source")
        .eq("user_id", user.id).eq("promoted", true).eq("mappable", true),
      supabase.from("wine_interactions").select("wine_name, rating")
        .eq("user_id", user.id).in("rating", ["loved", "not_for_me"])
        .order("updated_at", { ascending: false }).limit(30),
    ]);

    const dna = { countries: [], regions: [], grapes: [], estates: [] };
    const bucket = { country: "countries", region: "regions", varietal: "grapes", estate: "estates" };
    for (const row of accRes.data || []) {
      const key = bucket[row.dimension];
      if (!key || dna[key].length >= 12) continue;
      dna[key].push(row.source === "auto" ? `${row.display_name} (earned)` : row.display_name);
    }

    const loved = [];
    const notForMe = [];
    for (const r of feedbackRes.data || []) {
      if (r.rating === "loved" && loved.length < 10) loved.push(r.wine_name);
      if (r.rating === "not_for_me" && notForMe.length < 10) notForMe.push(r.wine_name);
    }

    const payload = {
      archetype: profile.archetype,
      dna,
      recentEvolution: recentEvents.map((e) =>
        `${e.display_name} (${e.dimension}) ${e.event_type === "promoted" ? "joined their DNA" : "rotated out"}`
      ),
      loved,
      notForMe,
      redCount: profile.red_count || 0,
      whiteCount: profile.white_count || 0,
      previousNarrative: profile.narrative,
    };

    const client = new Anthropic({ apiKey, timeout: 60000 });

    // One shot + one corrective retry, mirroring somm-picks
    const baseMessages = [{ role: "user", content: JSON.stringify(payload) }];
    let messages = baseMessages;
    let lastReason = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const start = Date.now();
      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages,
      });
      const ms = Date.now() - start;
      logClaudeUsage("palate-narrative", response.usage, ms);

      const rawText = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");

      let reason = null;
      if (response.stop_reason === "max_tokens") {
        reason = "response truncated at max_tokens — be more concise";
      } else {
        let parsed = null;
        try {
          parsed = JSON.parse(extractJson(rawText));
        } catch {
          reason = "output was not parseable JSON";
        }
        if (parsed) {
          const result = validateNarrative(parsed);
          if (result.valid) {
            if (attempt > 0) console.log("[palate-narrative] retry recovered");
            const { error } = await supabase
              .from("wine_profiles")
              .update({ narrative: result.narrative, narrative_updated_at: new Date().toISOString() })
              .eq("user_id", user.id);
            if (error) {
              console.error("[palate-narrative] save failed:", error.message);
              return fallback();
            }
            return NextResponse.json({ narrative: result.narrative });
          }
          reason = result.reason;
        }
      }

      lastReason = reason;
      if (attempt === 0) {
        console.log(`[palate-narrative] retrying after: ${reason}`);
        messages = [
          ...baseMessages,
          { role: "assistant", content: rawText || "(empty)" },
          {
            role: "user",
            content:
              `Your previous response was rejected: ${reason}. ` +
              `Reply with ONLY {"narrative": "<one paragraph, 3-5 sentences, 300-800 characters, no markup>"}.`,
          },
        ];
      }
    }

    console.error(`[palate-narrative] validation failed: ${lastReason}`);
    return fallback();
  } catch (err) {
    console.error("[palate-narrative] error:", err?.message || err);
    return fallback();
  }
}
