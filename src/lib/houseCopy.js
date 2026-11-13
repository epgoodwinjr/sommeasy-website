// houseCopy.js — the House List's computed copy (The House List, Phase 2).
//
// Every line whose words depend on data lives here: the From last night
// reply, the Log saved screen, the home crest's whisper, date and initial,
// rec meta and match tags, done lines, the Reserved caption — since Phase 4
// the journal's rows, months and timeline lines and a wine page's verdict,
// eyebrow and particulars — and since Phase 5 the palate's DNA counts and
// Search's lines. Bottle counts
// are computed from the engine's REAL thresholds (dnaThresholds.js) and
// written as words — never a hardcoded "two loved bottles". Rating emoji and
// labels come from RATINGS (ratings.js), never a local copy.
//
// Pure and dependency-light (ratings + thresholds only) so houseCopy.test.js
// runs the real module in plain node. Junk in → silence, never a throw.

import { ratingFor } from "./ratings.js";
import { CONFIDENCE_GATE, PROMOTION_THRESHOLDS, RATING_POINTS } from "./dnaThresholds.js";
import { budgetLimits } from "./matchTerms.js";

/** The brand's one line — Welcome's headline, home's sign-off and the link
 *  preview image (opengraph-image.js) all say it, so it lives once. */
export const TAGLINE = "Never guess at a wine list again.";

// ─── Numbers as words (the house rule — Ed, Nov 2026) ───
//
// In sentence copy, zero through ten are written as words; anything above
// ten stays digits, and so do prices, vintages and ratings. A sentence that
// opens with its number capitalizes it ("Three wines here are poured by the
// glass only."). Every sentence this module writes goes through numberWord /
// countOf; houseCopy.test.js sweeps them all for a stray small digit.
//
// Figures are not sentences: a tally ("9 tried · 5 loved · 3 to try"), a
// row's count ("3 bottles"), a label ("Journal · 9") and the terms bar's
// prices keep their digits.
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** Zero through ten as words ("two"), digits past that — and for anything
 *  that isn't a whole count. `capitalize` for a sentence start. */
export function numberWord(n, { capitalize = false } = {}) {
  const word = Number.isInteger(n) && WORDS[n] ? WORDS[n] : String(n);
  return capitalize ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/** A count with its noun, the noun agreeing: "one wine", "eight wines",
 *  "11 wines" — "Three wines" when it opens the sentence. */
export function countOf(n, noun, { capitalize = false } = {}) {
  return `${numberWord(n, { capitalize })} ${noun}${n === 1 ? "" : "s"}`;
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

/** "three more regions" — what a Show-more control or a list's tail still
 *  holds: the count as a word (to ten), the noun agreeing with it. */
export function moreOf(n, noun, { capitalize = false } = {}) {
  return `${numberWord(n, { capitalize })} more ${noun}${n === 1 ? "" : "s"}`;
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
  return `${verdictNoted(rating)} ${consequence}`;
}

/** What the reply can say at the tap, before the engine has answered:
 *  "❤️ Loved it — noted." Every verdictReply opens with it. */
export function verdictNoted(rating) {
  const r = ratingFor(rating);
  return r ? `${r.emoji} ${r.label} — noted.` : null;
}

/**
 * A reply in its two parts: `noted` (known at the tap) and `more` (what the
 * engine added when it answered — "" until it has). Home shows both as one
 * line and SAYS each once: the noted line is read when the reply takes
 * focus, and `more` is spoken by a status region that holds nothing else
 * (docs/motion README §15.2). A reply that doesn't open with the noted line
 * is all `more`.
 */
export function replyParts(noted, reply) {
  const said = typeof noted === "string" ? noted : "";
  if (typeof reply !== "string" || !reply) return { noted: said, more: "" };
  if (!said || !reply.startsWith(said)) return { noted: "", more: reply };
  return { noted: said, more: reply.slice(said.length).trim() };
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

/** Why there are no picks — each cause is a different thing to tell the
 *  diner, and a different thing to do next. What the page knows:
 *    read      wines read from the list
 *    pickable  wines the palate scored that have a price (under no terms)
 *    matched   wines the palate scored at all
 *    scored    wines that reached the scorer
 *    leftOut   wines left out because they are poured by the glass only
 *    open      on a list that matched NOTHING: the wines that could be the
 *              lone Adventure under no terms at all (matchTerms' canAdventure)
 *  In the order of what would bring picks back:
 *    "unread"   nothing was read at all
 *    "terms"    matches with prices exist — tonight's terms excluded them
 *    "glass"    every wine read was by the glass; nothing reached the scorer
 *    "prices"   the palate matched wines, and none of them shows a price
 *    "no_room"  nothing matched, and tonight's terms shut out every wine the
 *               lone Adventure could have been (with room for one, the page
 *               shows it instead — this is never reached)
 *    "none"     a true no-match with nothing to offer (also whenever the
 *               counts are unknown — the page never claims a cause it can't
 *               see)
 *  Since the lone Adventure (Nov 2026) a list that matched nothing usually
 *  HAS a pick, so "none" is rare: no wine on the list shows a price, or the
 *  only priced ones are wines the diner has rated against. */
export function emptyCause({ read, pickable, matched, scored, leftOut, open } = {}) {
  if (read === 0) return "unread";
  if (pickable > 0) return "terms";
  if (scored === 0 && leftOut > 0) return "glass";
  if (matched > 0) return "prices";
  if (matched === 0 && open > 0) return "no_room";
  return "none";
}

const EMPTY_HEADING = {
  unread: "No wines found",
  terms: "Nothing fits tonight’s terms",
  glass: "Only by-the-glass pours here",
  prices: "No prices to pick by",
  no_room: "Nothing fits tonight’s terms",
  none: "No matches found",
};

/** The picks view's heading. With no picks it says WHY (emptyCause). */
export function picksHeading({ picks, ...counts } = {}) {
  if (picks > 0) return "Your picks";
  return EMPTY_HEADING[emptyCause(counts)];
}

/** Under the heading: the list's size (and pages), then where to start —
 *  or, with no picks, what happened and what to do about it. It never says
 *  matches were found on a list where none were: only "terms" and "prices"
 *  say so, and both need a match to be reached. Under "none" the page adds
 *  the palate nudge (PALATE_NUDGE) on its own line. */
export function picksSubline({ wines, pages, picks, ...counts } = {}) {
  const n = Number.isInteger(wines) && wines > 0 ? wines : 0;
  if (!(picks > 0)) {
    const count = countOf(n, "wine");
    switch (emptyCause(counts)) {
      case "unread":
        return "We couldn’t find a wine in what you shared. Try a clearer photo, or paste the list as text.";
      case "terms":
        return `We read ${count} and found matches for your palate, but none that fit tonight’s terms. Adjust them to see your matches.`;
      case "glass":
        return `We read ${count}, and ${n === 1 ? "it is" : "each is"} poured by the glass only. Our picks are bottles — add the bottle list and we’ll take it from there.`;
      case "prices":
        return `We read ${count} and found matches for your palate, but none of them shows a price — and a pick needs one. Try a photo or a page that shows the prices.`;
      case "no_room":
        return n === 1
          ? `We read ${count}. It isn’t a clear match for your palate, and tonight’s terms leave no room for an adventure. Adjust them and we’ll take another look.`
          : `We read ${count}. None is a clear match for your palate, and tonight’s terms leave no room for an adventure. Adjust them and we’ll find one worth taking.`;
      default:
        return n === 1
          ? `We read ${count} and it doesn’t match your palate yet.`
          : `We read ${count} and none of them matches your palate yet.`;
    }
  }
  const across = pages > 1 ? ` across ${countOf(pages, "page")}` : "";
  const start = picks > 5 ? `here are your top ${numberWord(picks)}` : "here’s where to start";
  return `${countOf(n, "wine", { capitalize: true })}${across} — ${start}`;
}

/** Said under the sub line whenever wines were left out for being poured by
 *  the glass only (Ed, Nov 2026: bottles only, but say so). Null when none
 *  were — and when the sub line has already said it (cause "glass"). */
export function glassNote({ leftOut, cause } = {}) {
  if (!Number.isInteger(leftOut) || leftOut < 1 || cause === "glass") return null;
  const count = countOf(leftOut, "wine", { capitalize: true });
  return leftOut === 1
    ? `${count} here is poured by the glass only. We pick bottles, so we left it out.`
    : `${count} here are poured by the glass only. We pick bottles, so we left them out.`;
}

/** The line above a lone Splurge: none of the matches fits the budget, and
 *  the one pick is the wine a stretch over it (the terms rule allows one, up
 *  to twice the max). Null whenever that isn't exactly what happened — a
 *  single pick that fits is just a pick. `max` as the page holds it. */
export function loneSplurgeLine({ picks, max } = {}) {
  const limit = budgetLimits(null, max).max;
  if (limit == null || !Array.isArray(picks) || picks.length !== 1) return null;
  if (!(picks[0]?.price > limit)) return null;
  return "None of your matches fit tonight’s terms. This one is worth the stretch.";
}

/** The line above a lone Adventure (Ed, Nov 2026): the list was read, wines
 *  reached the scorer, none of them scored — and the page shows ONE wine
 *  anyway, the adventure worth taking, on the lone Splurge's principle. Null
 *  whenever that isn't exactly what happened: an Adventure among real
 *  matches is just a role, and an unknown match count never claims it. */
export function loneAdventureLine({ picks, matched } = {}) {
  if (matched !== 0 || !Array.isArray(picks) || picks.length !== 1) return null;
  if (picks[0]?.pickType !== "adventure") return null;
  return "Nothing on this list is a clear match for your palate, so here’s the adventure we’d take.";
}

/** The way back to the quiz, said wherever the palate found nothing it
 *  knows: under a lone Adventure, and under "No matches found". Ed's line —
 *  "Know there’s more you love? Add it to your palate and we’ll spot it next
 *  time." — in the parts the page sets, `link` being the link. */
export const PALATE_NUDGE = Object.freeze({
  lead: "Know there’s more you love?",
  link: "Add it to your palate",
  tail: "and we’ll spot it next time.",
  href: "/?quiz=refine",
});

/** Where the nudge shows: under the lone Adventure, and under a no-match
 *  with nothing to offer. Every other zero state has its own next step. */
export function showsPalateNudge({ loneAdventure = false, picks, cause } = {}) {
  if (loneAdventure === true) return true;
  return picks === 0 && cause === "none";
}

// ─── The journal + a wine's page (Phase 4) ───

// Little words that stay lowercase inside a place name ("Côte de Beaune",
// "Hemel-en-Aarde", "Montepulciano d'Abruzzo") — never when they open it
const PARTICLES = new Set([
  "de", "del", "della", "dei", "di", "du", "des", "d", "la", "le", "les", "l",
  "et", "en", "sur", "sous", "y", "e", "am", "an", "der", "im", "von", "van", "of", "and",
]);

function capitalize(word) {
  if (/^mc./.test(word)) return `Mc${word.charAt(2).toUpperCase()}${word.slice(3)}`;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function casePart(part, opens) {
  const elided = part.match(/^([a-z]+)['’](.+)$/);
  if (elided) {
    const [, head, rest] = elided;
    const lead = opens || !PARTICLES.has(head) ? capitalize(head) : head;
    return `${lead}${part.charAt(head.length)}${capitalize(rest)}`;
  }
  return !opens && PARTICLES.has(part) ? part : capitalize(part);
}

/** A place in display case. The resolver stores its lookup term lowercase
 *  (resolved_region "vouvray", "hemel-en-aarde"); a name that already has
 *  capitals is left as written. Junk → "". */
export function placeName(term) {
  if (typeof term !== "string") return "";
  const text = term.trim().replace(/\s+/g, " ");
  if (!text || text !== text.toLowerCase()) return text;
  return text.split(" ").map((word, w) => word.split("-")
    .map((part, p) => casePart(part, w === 0 && p === 0))
    .join("-")).join(" ");
}

function asDate(value) {
  const at = value instanceof Date ? value : new Date(value ?? NaN);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** "Aug 1" — "Today" when it is; ", 2025" joins a date from another year
 *  (`year: false` leaves it to a month head that already says it). Junk → "". */
export function shortDate(value, now = new Date(), { year = true } = {}) {
  const at = asDate(value);
  if (!at) return "";
  const today = new Date(now);
  if (at.toDateString() === today.toDateString()) return "Today";
  const day = at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return year && at.getFullYear() !== today.getFullYear() ? `${day}, ${at.getFullYear()}` : day;
}

/** A Tried month head: "September", or "September 2025" outside this year. */
export function monthLabel(value, now = new Date()) {
  const at = asDate(value);
  if (!at) return "";
  const month = at.toLocaleDateString("en-US", { month: "long" });
  return at.getFullYear() !== new Date(now).getFullYear() ? `${month} ${at.getFullYear()}` : month;
}

export function bottleCount(n) {
  return `${n} bottle${n === 1 ? "" : "s"}`;
}

/** Under the journal's lists: "13 tried · 5 loved · 3 to try". */
export function journalStats({ tried, loved, want } = {}) {
  const n = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
  return `${n(tried)} tried · ${n(loved)} loved · ${n(want)} to try`;
}

const TIMELINE_TARGETS = { varietal: "your DNA", estate: "your estates", region: "your regions", country: "your DNA" };

/** One dna_timeline row, as the journal's Timeline and a wine's page tell
 *  it: { emoji, text, strong } — "🧬 Chenin Blanc joined your DNA", "🍂 …
 *  left your estates", "✨ You became The Mosel Purist" (strong). A shift
 *  that kept its title is the signature moving. Junk → null. */
export function timelineLine(entry) {
  if (!entry || typeof entry !== "object" || typeof entry.display_name !== "string" || !entry.display_name) return null;
  const name = entry.display_name;
  const target = TIMELINE_TARGETS[entry.dimension] || "your DNA";
  if (entry.event_type === "promoted") return { emoji: "🧬", text: `${name} joined ${target}`, strong: false };
  if (entry.event_type === "demoted") return { emoji: "🍂", text: `${name} left ${target}`, strong: false };
  if (entry.event_type !== "shifted") return null;
  let text = `You became ${name}`;
  try {
    const change = JSON.parse(entry.dimension_value);
    if (change?.from?.title === change?.to?.title && change?.to?.epithet) {
      text = `Your signature shifted — ${change.to.epithet}`;
    }
  } catch { /* the title line stands */ }
  return { emoji: "✨", text, strong: true };
}

/** The Timeline's first entry, dated by the profile's creation. */
export const FOUNDING_LINE = Object.freeze({ emoji: "🎉", text: "Your palate began — quiz complete", strong: false });

// The pick roles' tags — a mirror of matchEngine's getPickTypeInfo labels,
// kept here so this module stays dependency-light (matchEngine drags the
// 2.9MB wineUnified.json behind it)
const SOMM_ROLE_TAGS = {
  top: "🏆 Top Pick",
  splurge: "✨ Splurge",
  value: "💰 Great Value",
  adventure: "🧭 Adventure",
  wildcard: "🍷 Worth Trying",
};

/** The role the Somm gave a pick ("💰 Great Value"), or null. */
export function sommRoleTag(role) {
  return SOMM_ROLE_TAGS[role] || null;
}

/** The user's mark on a journal row, at the end of its line: the rating's
 *  emoji, 🥂 for a bottle had but not yet rated (its verdict pending), 📌 a
 *  want, 👋 a pass. No row → null. Log's search, the journal and a wine
 *  page's same-vein rows all wear this one. */
export function journalMark(row) {
  if (!row || typeof row !== "object") return null;
  const rated = ratingFor(row.rating);
  if (rated) return rated.emoji;
  if (row.interaction_type === "had") return "🥂";
  if (row.interaction_type === "want") return "📌";
  if (row.interaction_type === "skip") return "👋";
  return null;
}

/** Under a verdict: where the bottle was drunk — the Log's place, else a
 *  Somm pick's provenance, else nothing. */
export function verdictWhere(row) {
  if (row?.place === "home") return "At home";
  if (row?.place === "out") return "Out";
  return row?.somm_pick_role ? "From the list at dinner" : "";
}

/** "Keep ❤️ Loved it" — cancels a verdict change. */
export function keepLabel(rating) {
  const r = ratingFor(rating);
  return r ? `Keep ${r.emoji} ${r.label}` : null;
}

/**
 * A journal row's meta line: left "REGION · GRAPE" from the stored
 * resolution ("REGION · VERDICT PENDING" for a had with no rating), right
 * the date — "🍷 SOMM PICK · AUG 1" (accent) on a Somm pick, "SAVED …" on a
 * want. Tried rows sit under month heads, so their dates skip the year.
 * Uppercased by CSS. → { meta, right, accent }
 */
export function journalRowMeta(row, now = new Date()) {
  if (!row || typeof row !== "object") return { meta: "", right: "", accent: false };
  const region = placeName(row.resolved_region);
  const at = row.updated_at ?? row.created_at;
  if (row.interaction_type === "had") {
    const meta = ratingFor(row.rating)
      ? metaLine(region, row.resolved_varietal)
      : metaLine(region, "Verdict pending");
    const date = shortDate(at, now, { year: false });
    return row.somm_pick_role
      ? { meta, right: metaLine("🍷 Somm pick", date), accent: true }
      : { meta, right: date, accent: false };
  }
  const meta = metaLine(region, row.resolved_varietal);
  const date = shortDate(at, now);
  return { meta, right: row.interaction_type === "want" && date ? `Saved ${date}` : date, accent: false };
}

/** A wine page's eyebrow: "VOUVRAY · FRANCE" (uppercased by CSS). */
export function wineMeta(facts) {
  return metaLine(placeName(facts?.region), facts?.country);
}

/** The particulars, only the ones known: [[label, value], …]. The region
 *  carries its province when that says something more ("Vouvray, Loire
 *  Valley"). There's no Style row: the journal has no real source for it. */
export function particulars(facts, vintage) {
  const f = facts && typeof facts === "object" ? facts : {};
  const region = placeName(f.region);
  const province = placeName(f.province);
  const rows = [
    ["Producer", f.producer],
    ["Region", region && province && province.toLowerCase() !== region.toLowerCase() ? `${region}, ${province}` : region],
    ["Country", f.country],
    ["Grape", f.grape],
    ["Vintage", vintage],
  ];
  return rows.filter(([, value]) => typeof value === "string" && value.trim() !== "");
}

// ─── Your palate + Search (Phase 5) ───

/** A DNA row's count: the bottles the engine counted toward it; with none,
 *  "from your quiz" only when the quiz put it there (`source` "quiz") — an
 *  earned row can reach zero (its bottles deleted, or a rollup that never
 *  had one) and is never the quiz's. "" when the count is unknown
 *  (unreadable accumulation) — never a guess. */
export function dnaCount(bottles, source) {
  if (Number.isInteger(bottles) && bottles > 0) return bottleCount(bottles);
  return bottles === 0 && source === "quiz" ? "from your quiz" : "";
}

const DNA_KIND_LABELS = { country: "Country", region: "Region", grape: "Grape", estate: "Estate" };

/** "Grape" — a DNA entry's kind (palateView's kinds, not engine dimensions:
 *  "varietal" is a grape there). */
export function dnaKindLabel(kind) {
  return DNA_KIND_LABELS[kind] || "";
}

/** A DNA search result's right side: "Grape · 5 bottles", the kind alone
 *  when the count is unknown. */
export function dnaResultLine(entry) {
  if (!entry || typeof entry !== "object") return "";
  return metaLine(dnaKindLabel(entry.kind), dnaCount(entry.bottles, entry.source));
}

/** Building now: "three loved bottles away" (n from lovedBottlesAway). */
export function bottlesAwayLine(n) {
  return Number.isInteger(n) && n > 0 ? `${bottlesPhrase(n)} away` : null;
}

/** Search's first group head: "In your journal · 9" (uppercased by CSS). */
export function journalGroupLabel(count) {
  return `In your journal · ${count}`;
}

/** Search with nothing to show: "Nothing for “zinfandel” on our list yet." */
export function nothingFoundLine(query) {
  const q = typeof query === "string" ? query.trim() : "";
  return q ? `Nothing for “${q}” on our list yet.` : null;
}

// ─── The wine page's remove + Account (Phase 6) ───

/** Remove from journal's confirm: the question, then what leaves with the
 *  row — the verdict and its pull on the palate (the delete reverses the
 *  rating's evidence), the note. A had with no verdict pulled on nothing. */
/** Account › Usual spend's value: "$40 – $90", "Up to $90", "From $40",
 *  or "Not set" (preferences.spend, numbers or null). */
export function usualSpendLine(spend) {
  const s = spend && typeof spend === "object" ? spend : {};
  const lo = digits(s.min), hi = digits(s.max);
  if (lo && hi) return `$${lo} – $${hi}`;
  if (hi) return `Up to $${hi}`;
  return lo ? `From $${lo}` : "Not set";
}

/** Account › Color's value — the terms bar's words: "All wines", "Reds"… */
export function colorTerm(color) {
  return COLOR_TERMS[color] || COLOR_TERMS.all;
}

export function removeConfirmCopy(what) {
  const { rated = false, note = false } = what && typeof what === "object" ? what : {};
  const ask = "Remove this bottle from your journal?";
  if (rated) {
    return `${ask} Your verdict${note ? " and note go" : " goes"} with it, and so does its pull on your palate.`;
  }
  return note ? `${ask} Your note goes with it.` : ask;
}
