// sommPicks.js — payload builder + response validator for /api/somm-picks.
//
// Deliberately dependency-free: display-name helpers are injected by the
// caller so this module is testable in plain node (dynamic import) without
// dragging in matchEngine's JSON imports.

export const SOMM_ROLES = ["top", "value", "adventure", "splurge", "wildcard"];
const CANDIDATE_CAP = 25;
const REASON_CAP = 3;
const NOTE_MAX_CHARS = 500;
const OCCASION_MAX_CHARS = 200;

const identity = (x) => x;

function prettifyId(id) {
  if (!id || typeof id !== "string") return id;
  return id
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function passesColor(entry, color) {
  if (!color || color === "all") return true;
  // Mirrors the refilter semantics: explicit mismatch excludes; unknown color
  // stays (text-path entries without Vision metadata are permissive)
  if (!entry.detectedColor) return true;
  return entry.detectedColor === color;
}

function passesBudget(entry, budget) {
  if (budget?.min != null && entry.price < budget.min) return false;
  // Keep up-to-2×max wines in the slate — they're legal splurge candidates
  if (budget?.max != null && entry.price > budget.max * 2) return false;
  return true;
}

/**
 * Build the compact request payload for /api/somm-picks from state the
 * recommend page already holds after runAnalysis.
 *
 * display: { varietal(id), region(regionId, countryId), country(id) } —
 * pass matchEngine's helpers from the page; defaults keep raw ids.
 */
export function buildSommPayload({
  scoredEntries,
  algorithmicPicks,
  pickCount,
  profile,
  ratedInteractions,
  totalParsed,
  budget,
  color,
  occasion,
  display,
}) {
  const d = {
    varietal: display?.varietal || identity,
    region: display?.region || identity,
    country: display?.country || identity,
  };

  const eligible = (scoredEntries || [])
    .filter((e) => e.score > 0 && e.price != null)
    .filter((e) => passesColor(e, color))
    .filter((e) => passesBudget(e, budget))
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATE_CAP);

  const candidates = eligible.map((e, i) => ({
    i,
    name: e.name,
    price: e.price,
    vintage: e.vintage || null,
    section: e.section || null,
    varietal: e.detectedVarietalId ? d.varietal(e.detectedVarietalId) : null,
    region: e.detectedRegionIds?.length ? d.region(e.detectedRegionIds[0], e.detectedCountry) : null,
    country: e.detectedCountry ? d.country(e.detectedCountry) : null,
    score: Math.round(e.score * 10) / 10,
    reasons: (e.matchReasons || []).slice(0, REASON_CAP).map((r) => r.label),
  }));

  // Map the algorithmic picks onto candidate indices (name+price identity)
  const pickKey = (e) => `${e.name}::${e.price}`;
  const indexByKey = new Map(eligible.map((e, i) => [pickKey(e), i]));
  const algorithmicIndices = (algorithmicPicks || [])
    .map((p) => indexByKey.get(pickKey(p)))
    .filter((i) => i !== undefined);

  const scoredPositive = (scoredEntries || []).filter((e) => e.score > 0);
  const distinct = (arr) => Array.from(new Set(arr)).length;

  const loved = [];
  const notForMe = [];
  for (const r of ratedInteractions || []) {
    const item = {
      name: r.wine_name,
      varietal: r.resolved_varietal || null,
      region: r.resolved_region || null,
    };
    if (r.rating === "loved" && loved.length < 10) loved.push(item);
    if (r.rating === "not_for_me" && notForMe.length < 10) notForMe.push(item);
  }

  return {
    candidates,
    algorithmicPicks: algorithmicIndices,
    pickCount,
    dna: {
      archetype: profile?.archetype || null,
      narrative: profile?.narrative || null,
      countries: (profile?.countries || []).slice(0, 8).map(d.country),
      varietals: (profile?.varietals || []).slice(0, 8).map(d.varietal),
      topEstates: Object.values(profile?.estates || {})
        .flat()
        .slice(0, 8)
        .map(prettifyId),
      specificWines: (profile?.specific_wines || []).slice(0, 5),
    },
    feedback: { loved, notForMe },
    menu: {
      totalWines: totalParsed || scoredEntries?.length || 0,
      distinctCountries: distinct(scoredPositive.map((e) => e.detectedCountry).filter(Boolean)),
      distinctRegions: distinct(scoredPositive.flatMap((e) => e.detectedRegionIds || [])),
    },
    budget: { min: budget?.min ?? null, max: budget?.max ?? null },
    color: color || null,
    occasion: occasion ? String(occasion).slice(0, OCCASION_MAX_CHARS) : null,
  };
}

/** Strip markdown fences an LLM may wrap around JSON. */
export function extractJson(text) {
  return (text || "").replace(/```json\n?|```\n?/g, "").trim();
}

/**
 * Clip an overlong note to the cap, preferring a sentence boundary so we
 * never ship a note that trails off mid-thought.
 */
function clipNote(note) {
  if (note.length <= NOTE_MAX_CHARS) return note;
  const head = note.slice(0, NOTE_MAX_CHARS);
  const lastStop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (lastStop > NOTE_MAX_CHARS * 0.4) return head.slice(0, lastStop + 1);
  const lastSpace = head.lastIndexOf(" ");
  const base = lastSpace > 0 ? head.slice(0, lastSpace) : head.slice(0, NOTE_MAX_CHARS - 1);
  return base.replace(/[,;:\s]+$/, "") + "…";
}

/**
 * Validate + normalize the LLM response against the request that produced it.
 * Returns { valid: true, picks, sommSummary } or { valid: false, reason }.
 *
 * Salvage before rejecting: the failure mode here is silent fallback, so
 * discarding six good notes over one fixable slip is the worst outcome.
 * Salvageable (normalized in place): overlong notes → clipped at a sentence
 * boundary; extra picks beyond pickCount → trimmed; an over-budget pick the
 * model forgot to label → promoted to "splurge" when that's legal (≤2x max,
 * splurge slot unused). Hard failures (caller retries, then falls back):
 * missing/empty notes, bad or duplicate indices, too few picks, and budget
 * breaks no relabeling can fix.
 */
export function validateSommResponse(parsed, { candidates, pickCount, budget }) {
  if (!parsed || typeof parsed !== "object") return { valid: false, reason: "not an object" };
  if (!Array.isArray(parsed.picks)) return { valid: false, reason: "picks not an array" };
  if (parsed.picks.length < pickCount) {
    return { valid: false, reason: `pick count ${parsed.picks.length} < ${pickCount}` };
  }
  // More picks than asked for: keep the first pickCount rather than rejecting
  const rawPicks = parsed.picks.slice(0, pickCount);

  const seen = new Set();
  const coreUsed = new Set();
  const picks = [];

  for (const raw of rawPicks) {
    const i = raw?.i;
    if (!Number.isInteger(i) || i < 0 || i >= candidates.length) {
      return { valid: false, reason: `index ${i} not in candidates` };
    }
    if (seen.has(i)) return { valid: false, reason: `duplicate index ${i}` };
    seen.add(i);

    const note = typeof raw.note === "string" ? clipNote(raw.note.trim()) : "";
    if (!note) {
      return { valid: false, reason: `note missing for index ${i}` };
    }

    // Role normalization (not a failure): unknown roles → wildcard;
    // top/value/adventure/splurge at most once each, extras → wildcard
    let role = SOMM_ROLES.includes(raw.role) ? raw.role : "wildcard";
    if (role !== "wildcard") {
      if (coreUsed.has(role)) role = "wildcard";
      else coreUsed.add(role);
    }

    const price = candidates[i].price;
    if (budget?.max != null) {
      if (role === "splurge") {
        if (price > budget.max * 2) return { valid: false, reason: `splurge ${price} > 2x max` };
      } else if (price > budget.max) {
        // Over-budget wine without the splurge label. If it's a legal splurge
        // and the slot is free, that's clearly what the model meant.
        if (price <= budget.max * 2 && !coreUsed.has("splurge")) {
          role = "splurge";
          coreUsed.add("splurge");
        } else {
          return { valid: false, reason: `non-splurge ${price} > budget max` };
        }
      }
    }

    picks.push({ i, role, note });
  }

  const sommSummary =
    typeof parsed.sommSummary === "string" ? parsed.sommSummary.trim().slice(0, NOTE_MAX_CHARS) : "";

  return { valid: true, picks, sommSummary };
}
