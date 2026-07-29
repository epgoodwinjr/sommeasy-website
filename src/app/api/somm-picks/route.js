import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit, getClientIp, logClaudeUsage, RATE_LIMIT_MESSAGE } from "@/lib/rateLimit";
import { CLAUDE_MODEL } from "@/lib/anthropicConfig";
import { extractJson, validateSommResponse } from "@/lib/sommPicks";

export const maxDuration = 300;

// The Somm's voice is progressive enhancement: ANY failure in this route —
// missing key, timeout, upstream error, malformed LLM output — returns
// { fallback: true } and the client silently keeps the algorithmic picks.
// The app must never be worse than Phase 1 because of this feature.
const fallback = () => NextResponse.json({ fallback: true });

const SYSTEM_PROMPT = `You are The Somm — Sommeasy's sommelier voice. You are the knowledgeable friend who knows wine, never the stuffy sommelier. Confident but not pretentious. Warm and conversational. Zero gatekeeping jargon — no wine-speak unless it genuinely helps, and if you use a term, it should explain itself in context.

You receive a JSON payload with:
- "candidates": a numbered list of wines from tonight's restaurant list, pre-scored against the user's palate (higher score = stronger algorithmic match), with the match reasons.
- "pickCount": how many wines to choose.
- "dna": the user's palate profile — archetype, the regions/varietals/producers they chose, wines they named as favorites.
- "feedback": wines they actually rated — "loved" and "notForMe". This is the strongest signal you have. Trust it over the quiz.
- "algorithmicPicks": the indices the scoring algorithm would choose. A sane default — improve on it where you see a smarter slate, don't change for change's sake.
- "menu": shape of the full list. "budget": the user's price range. "color": their color filter tonight, if any.
- "occasion": what they're doing tonight, if they told us.

Your task:
1. Choose exactly pickCount wines FROM THE NUMBERED CANDIDATES ONLY. Never invent a wine. Never use an index that isn't in candidates.
2. Assign each pick a role: "top", "value", "adventure", "splurge", or "wildcard". Use each of top/value/adventure/splurge at most once; any pick beyond the four core roles is "wildcard".
3. Budget is a hard constraint: at most ONE pick may be priced above budget.max, and that pick MUST carry the "splurge" role (never above 2x budget.max). Every other pick must be at or under budget.max — check each price against the budget before you commit to it.
4. Write a 2–3 sentence note for each pick — under 450 characters, never longer. Every note must connect to THIS user's actual palate: their archetype, a wine they loved, a region or grape from their DNA. Speak to them, not about wine in general.
5. If "occasion" is present, lead the notes with the pairing rationale — the food and moment come first, the grape second. Be honest about pairing traps: if a candidate fights the food (a low-acid oaky white against tomato dishes, a tannic monster against delicate fish), say so plainly in whichever note it affects, or steer the selection around it.
6. Write one "sommSummary" of at most 2 sentences framing the list as a whole — what tonight's list is good at for this palate.

Output ONLY a JSON object, no prose before or after, exactly this shape:
{"picks": [{"i": <candidate index>, "role": "<role>", "note": "<2-3 sentences>"}], "sommSummary": "<≤2 sentences>"}`;

export async function POST(request) {
  const rate = checkRateLimit("somm-picks", getClientIp(request));
  if (!rate.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback();

  try {
    const payload = await request.json();
    if (
      !Array.isArray(payload?.candidates) ||
      payload.candidates.length === 0 ||
      !Number.isInteger(payload?.pickCount) ||
      payload.pickCount < 1
    ) {
      return fallback();
    }

    const client = new Anthropic({ apiKey, timeout: 60000 });

    // One shot + one corrective retry. Validation salvages what it can
    // (sommPicks.js); when it still hard-fails, we hand the model its own
    // output and the specific rule it broke — a targeted fix, not a re-roll.
    const baseMessages = [{ role: "user", content: JSON.stringify(payload) }];
    let messages = baseMessages;
    let lastReason = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const start = Date.now();
      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages,
      });
      const ms = Date.now() - start;

      logClaudeUsage("somm-picks", response.usage, ms);

      const rawText = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

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
          const result = validateSommResponse(parsed, {
            candidates: payload.candidates,
            pickCount: payload.pickCount,
            budget: payload.budget,
          });
          if (result.valid) {
            if (attempt > 0) console.log("[somm-picks] retry recovered");
            return NextResponse.json({ picks: result.picks, sommSummary: result.sommSummary });
          }
          reason = result.reason;
        }
      }

      lastReason = reason;
      if (attempt === 0) {
        console.log(`[somm-picks] retrying after: ${reason}`);
        messages = [
          ...baseMessages,
          { role: "assistant", content: rawText || "(empty)" },
          {
            role: "user",
            content:
              `Your previous response was rejected: ${reason}. ` +
              `Reply with ONLY the corrected JSON object in the exact required shape. ` +
              `Rules to satisfy: exactly pickCount picks; every "i" must be a candidate index with no duplicates; ` +
              `every pick needs a "note" of 2-3 sentences under 450 characters; ` +
              `at most one pick may be priced above budget.max and it must have role "splurge" (never above 2x budget.max).`,
          },
        ];
      }
    }

    console.error(`[somm-picks] validation failed: ${lastReason}`);
    return fallback();
  } catch (err) {
    console.error("[somm-picks] error:", err?.message || err);
    return fallback();
  }
}
