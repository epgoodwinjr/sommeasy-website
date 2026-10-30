// houseCopy.js — the House List's computed copy (The House List, Phase 2).
//
// Every line whose words depend on data lives here: the From last night
// reply, the Log saved screen, the home crest's whisper, date and initial,
// rec meta and match tags, done lines, the Reserved caption. Bottle counts
// are computed from the engine's REAL thresholds (dnaThresholds.js) and
// written as words — never a hardcoded "two loved bottles". Rating emoji and
// labels come from RATINGS (ratings.js), never a local copy.
//
// Pure and dependency-light (ratings + thresholds only) so houseCopy.test.js
// runs the real module in plain node. Junk in → silence, never a throw.

import { ratingFor } from "./ratings.js";
import { CONFIDENCE_GATE, PROMOTION_THRESHOLDS, RATING_POINTS } from "./dnaThresholds.js";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** 1–9 as words ("two"), digits past that. `capitalize` for a sentence start. */
export function numberWord(n, { capitalize = false } = {}) {
  const word = WORDS[n] && n > 0 ? WORDS[n] : String(n);
  return capitalize ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/** Loved bottles a dimension needs to join the DNA from nothing — "Two
 *  loved bottles made the case" (estates), three for a grape, and so on. */
export function lovedBottlesToPromote(dimension) {
  const threshold = PROMOTION_THRESHOLDS[dimension];
  return threshold ? Math.ceil(threshold / RATING_POINTS.loved) : null;
}

/** Loved bottles still to go at `points` — rounded up, never below one. */
export function lovedBottlesAway(dimension, points) {
  const threshold = PROMOTION_THRESHOLDS[dimension];
  if (!threshold) return null;
  return Math.max(1, Math.ceil((threshold - (Number(points) || 0)) / RATING_POINTS.loved));
}

export function bottlesPhrase(n) {
  return `${numberWord(n)} loved bottle${n === 1 ? "" : "s"}`;
}

// More specific dimensions win a tie: an estate is a sharper fact than a
// grape, a grape than a region, a region than a country
const SPECIFICITY = ["estate", "varietal", "region", "country"];

/**
 * The dimension a rating moved that's closest to joining the DNA:
 * mappable, not yet promoted, with points on the board. Rows are
 * dna_accumulation rows. → { name, dimension, n } or null.
 */
export function nearestPromotion(rows) {
  if (!Array.isArray(rows)) return null;
  let best = null;
  for (const row of rows) {
    if (!row || typeof row !== "object" || row.promoted || row.mappable === false) continue;
    if (!(Number(row.points) > 0) || !row.display_name) continue;
    const n = lovedBottlesAway(row.dimension, row.points);
    if (n === null) continue;
    const rank = SPECIFICITY.indexOf(row.dimension);
    if (!best || n < best.n || (n === best.n && rank < best.rank)) {
      best = { name: row.display_name, dimension: row.dimension, n, rank };
    }
  }
  return best && { name: best.name, dimension: best.dimension, n: best.n };
}

/** What a rating does to the next picks, in the Somm's voice. */
export const RATING_CONSEQUENCE = Object.freeze({
  loved: "Loved bottles pull hardest — your next picks will lean its way.",
  liked: "A gentle nudge — your DNA leans a little its way.",
  fine: "We’ll weigh it lightly next time.",
  not_for_me: "We’ll steer you around it next time.",
});

/**
 * The From last night reply: "❤️ Loved it — noted. {consequence}". The
 * consequence is the first that applies: a promotion, then (loved only) the
 * nearest dimension's distance, then the rating's own line.
 */
export function verdictReply({ rating, promotions = [], nearest = null } = {}) {
  const r = ratingFor(rating);
  if (!r) return null;
  const promoted = Array.isArray(promotions) ? promotions.find((p) => p?.displayName) : null;
  let consequence;
  if (promoted) {
    consequence = `${promoted.displayName} just joined your DNA.`;
  } else if (rating === "loved" && nearest?.name && nearest.n > 0) {
    consequence = `${nearest.name} is now ${bottlesPhrase(nearest.n)} from joining your DNA.`;
  } else {
    consequence = RATING_CONSEQUENCE[rating];
  }
  return `${r.emoji} ${r.label} — noted. ${consequence}`;
}

/**
 * The Log saved screen: { eyebrow, headline, sub, lines }. A shift takes
 * the headline (and the eyebrow, so they agree); a promotion headlines
 * otherwise; a first-ever rated bottle gets its own line. Promotions that
 * didn't headline and any demotions become `lines` under the recap.
 */
export function savedCopy({ rating, promotions = [], demotions = [], shift = null, isFirst = false } = {}) {
  const r = ratingFor(rating);
  const promos = (Array.isArray(promotions) ? promotions : []).filter((p) => p?.displayName);
  const demos = (Array.isArray(demotions) ? demotions : []).filter((d) => d?.displayName);
  const shifted = Boolean(shift?.shifted && shift.title);
  const lines = [];
  let eyebrow, headline, sub;

  if (shifted) {
    eyebrow = "✨ Your palate shifted";
    headline = `You became ${shift.title}`;
    sub = shift.epithet || "";
    promos.forEach((p) => lines.push(`🧬 ${p.displayName} joined your DNA`));
  } else if (promos.length > 0) {
    const [first, ...rest] = promos;
    const n = lovedBottlesToPromote(first.dimension) ?? lovedBottlesToPromote("estate");
    eyebrow = "🧬 Your DNA just grew";
    headline = `${first.displayName} just joined your DNA`;
    sub = `${numberWord(n, { capitalize: true })} loved bottles made the case — we’ll look for it on every list you scan.`;
    rest.forEach((p) => lines.push(`🧬 ${p.displayName} joined your DNA`));
  } else {
    eyebrow = r ? `${r.emoji} ${r.label}` : "";
    headline = isFirst ? "Your first entry is in" : "Noted in your journal";
    sub = isFirst
      ? "The Somm just rewrote your list around it — two more selections are open."
      : RATING_CONSEQUENCE[rating] || "";
  }
  demos.forEach((d) => lines.push(`🍂 ${d.displayName} left your DNA`));
  return { eyebrow, headline, sub, lines };
}

/** The masthead initial: the name's first letter, else the email's. */
export function crestInitial(user) {
  const name = typeof user?.user_metadata?.name === "string" ? user.user_metadata.name.trim() : "";
  const source = name || (typeof user?.email === "string" ? user.email.trim() : "");
  return source ? source.charAt(0).toUpperCase() : "";
}

/** "Wednesday, September 30" — the home date line (uppercased by CSS). */
export function homeDateLine(date = new Date()) {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

const WHISPER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** The date line's whisper: the latest promotion or shift, if it happened
 *  in the last 30 days. `event` is a dna_timeline row. */
export function whisperLine(event, now = Date.now()) {
  if (!event?.display_name) return null;
  const at = new Date(event.event_at ?? NaN).getTime();
  if (Number.isNaN(at) || now - at >= WHISPER_WINDOW_MS) return null;
  if (event.event_type === "shifted") return `✨ You became ${event.display_name}`;
  if (event.event_type === "promoted") return `🧬 ${event.display_name} just joined your DNA`;
  return null;
}

export function journalLinkLabel(hadCount) {
  return hadCount > 0 ? `Journal · ${hadCount}` : "Journal";
}

/** A rec row's match tag, from the profile engine's matchType. */
export function matchTag(matchType) {
  if (matchType === "region + grape") return "📍 Region + grape";
  if (matchType === "grape") return "🍇 Grape match";
  if (matchType === "region") return "📍 Region match";
  return "🧭 Discovery";
}

/** "Stellenbosch · Chenin Blanc" — whatever's known, in order. */
export function metaLine(...parts) {
  return parts.filter((p) => typeof p === "string" && p.trim()).join(" · ");
}

/** REGION · GRAPE from a resolveWine() result, only when it resolved at or
 *  above the confidence gate — a guess never prints as a fact. */
export function confidentMeta(resolution) {
  if (!resolution || !(resolution.confidence >= CONFIDENCE_GATE)) return "";
  return metaLine(resolution.region, resolution.varietal);
}

/** From last night's row meta: "HEMEL-EN-AARDE · ORDERED AT THE TABLE". */
export function verdictMeta(region) {
  return metaLine(region, "Ordered at the table");
}

/** The lines that replace a rec row's actions once acted on. */
export const REC_DONE = Object.freeze({
  want: "📌 On your want list — we’ll flag it when it turns up on a menu.",
  skip: "👋 Struck from your list.",
});

export function ratedDoneLine(rating) {
  const r = ratingFor(rating);
  return r ? `${r.emoji} ${r.label} — noted in your journal.` : null;
}

/** Under the Reserved rows: how many open after the first rating. */
export function reservedCaption(count) {
  if (!(count > 0)) return null;
  return count === 1
    ? "One more selection opens after your first rating."
    : `${numberWord(count, { capitalize: true })} more selections open after your first rating.`;
}

// ─── Match & picks (Phase 3) ───

const COLOR_TERMS = { all: "All wines", red: "Reds", white: "Whites", sparkling: "Sparkling" };

const digits = (v) => {
  const s = typeof v === "number" && Number.isFinite(v) ? String(v) : typeof v === "string" ? v.trim() : "";
  return /^\d+$/.test(s) ? s : "";
};

/** Tonight's terms in one line — the bar over Your picks (uppercased by
 *  CSS): "All wines · $40–$90 · “something South African”". */
export function termsLine({ color, min, max, steer } = {}) {
  const lo = digits(min), hi = digits(max);
  const price = lo && hi ? `$${lo}–$${hi}` : hi ? `Up to $${hi}` : lo ? `From $${lo}` : "Any price";
  const said = typeof steer === "string" ? steer.trim() : "";
  return [COLOR_TERMS[color] || COLOR_TERMS.all, price, said ? `“${said}”` : "No steer"].join(" · ");
}

/** The reading state's line, following real progress: "list" while the
 *  list is read, "count" once the parse returns, "weigh" while matching,
 *  "done" as the picks appear ("Three bottles, three kinds of yes." — null
 *  when there are none, so nothing promises a yes). */
export function readingLine(phase, count) {
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  if (phase === "count" && n) return n === 1 ? "Reading one wine…" : `Reading ${numberWord(n)} wines…`;
  if (phase === "weigh") return `Weighing ${n === 1 ? "it" : "them"} against your DNA…`;
  if (phase === "done") {
    if (!n) return null;
    return n === 1
      ? "One bottle, one kind of yes."
      : `${numberWord(n, { capitalize: true })} bottles, ${numberWord(n)} kinds of yes.`;
  }
  return "Reading the list…";
}

/** A pick the user already knows (its journal row — matchTerms'
 *  findJournalRow): rated → "❤️ Loved it in August" (the year joins when it
 *  isn't this one); a want → "📌 On your want list". Otherwise null. */
export function pickFlag(row, now = new Date()) {
  if (!row || typeof row !== "object") return null;
  const r = ratingFor(row.rating);
  if (r) {
    const at = new Date(row.updated_at ?? NaN);
    if (Number.isNaN(at.getTime())) return `${r.emoji} ${r.label}`;
    const month = at.toLocaleDateString("en-US", { month: "long" });
    const year = at.getFullYear() !== new Date(now).getFullYear() ? ` ${at.getFullYear()}` : "";
    return `${r.emoji} ${r.label} in ${month}${year}`;
  }
  return row.interaction_type === "want" ? "📌 On your want list" : null;
}

/** A pick's note until the Somm's lands — and when it never does: the match
 *  engine's strongest reason, said plainly. `reasons` are matchReasons
 *  types; the names arrive display-ready (never ids), and a reason whose
 *  name is missing gives way to the next. Nothing from the DNA → null. */
export function pickNote({ reasons, producer, region, grape, country } = {}) {
  const has = new Set(Array.isArray(reasons) ? reasons : []);
  const named = (s) => typeof s === "string" && s.trim() !== "";
  if (has.has("favorite")) return "One of your favorites — and it’s on tonight’s list.";
  if (has.has("estate") && named(producer)) return `${producer} — an estate already in your DNA.`;
  if (has.has("region") && has.has("varietal") && named(region) && named(grape)) {
    return `${grape} from ${region} — both already in your DNA.`;
  }
  if (has.has("varietal") && named(grape)) return `${grape} — a grape already in your DNA.`;
  if (has.has("region") && named(region)) return `${region} — a region already in your DNA.`;
  if ((has.has("country") || has.has("country_region")) && named(country)) {
    return `${country} — a country already in your DNA.`;
  }
  return null;
}

/** Under "Your picks": the list's size (and pages), then where to start —
 *  or, with no picks, what to try next. */
export function picksSubline({ wines, pages, picks } = {}) {
  const n = Number.isInteger(wines) && wines > 0 ? wines : 0;
  const count = `${n} wine${n === 1 ? "" : "s"}`;
  if (!(picks > 0)) {
    return `We read ${count} but couldn’t find matches for your DNA. Try adjusting tonight’s terms or updating your profile.`;
  }
  const across = pages > 1 ? ` across ${pages} pages` : "";
  return `${count}${across} — ${picks > 5 ? `here are your top ${picks}` : "here’s where to start"}`;
}
