// rateLimit.js — in-memory per-IP sliding-window limiter for the paid Vision
// routes and the SSRF-guarded fetch-menu route.
//
// Abuse protection, not billing enforcement: Fluid Compute keeps instances warm,
// but a cold start resetting the window is acceptable. No external store.
//
// KNOWN LIMITATION (per-instance): the window lives in this process's memory,
// so the effective limit is MAX_REQUESTS × (number of warm instances), and a
// cold start starts a fresh window. That's fine for casual abuse but is NOT a
// hard ceiling against a distributed attacker. The durable upgrade — a shared
// Redis/KV sliding window keyed the same `${route}:${ip}` way — is tracked in
// CLAUDE.md priorities; swap the Map for a KV client behind this same
// checkRateLimit signature when traffic justifies it (no caller changes).
// Turnstile (src/lib/captcha.js) is the complementary human-check path,
// prepared behind NEXT_PUBLIC_CAPTCHA_ENABLED for the same threat.

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const MAX_REQUESTS = 10;   // per IP, per route, per window

export const RATE_LIMIT_MESSAGE =
  "Easy there — you've hit the scan limit for now. Try again in an hour.";

// `${route}:${ip}` → array of request timestamps within the window
const buckets = new Map();

export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Record a request and decide whether it may proceed. `max` defaults to
 * MAX_REQUESTS; a cheap route may allow more (/api/lists — one write per
 * page a sitting reads).
 * Returns { allowed: true } or { allowed: false, retryAfterSec }.
 */
export function checkRateLimit(route, ip, max = MAX_REQUESTS) {
  // Off ONLY outside production, and only on an explicit signal:
  //  - E2E_DISABLE_RATE_LIMIT=1 — playwright.config.ts sets it on the
  //    `next dev` it launches. (A NODE_ENV check alone never fires there:
  //    Playwright doesn't set NODE_ENV, and Next inlines it at compile time
  //    — "development" under `next dev` — so the limiter used to be LIVE in
  //    every e2e run.)
  //  - NODE_ENV=test — plain-node harnesses that import a route handler.
  // `process.env.NODE_ENV` is read literally on purpose: a production build
  // inlines it as "production", so this whole branch compiles away.
  if (
    process.env.NODE_ENV !== "production" &&
    (process.env.E2E_DISABLE_RATE_LIMIT === "1" || process.env.NODE_ENV === "test")
  ) {
    return { allowed: true };
  }

  const key = `${route}:${ip}`;
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  const stamps = (buckets.get(key) || []).filter((t) => t > cutoff);

  const limit = Number.isInteger(max) && max > 0 ? max : MAX_REQUESTS;
  if (stamps.length >= limit) {
    buckets.set(key, stamps);
    const retryAfterSec = Math.ceil((stamps[0] + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSec };
  }

  stamps.push(now);
  buckets.set(key, stamps);

  // Opportunistic cleanup so the map can't grow unbounded on a long-lived instance
  if (buckets.size > 1000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => t <= cutoff)) buckets.delete(k);
    }
  }

  return { allowed: true };
}

/**
 * The one price table (Sonnet 4.6, $/MTok: $3 in, $15 out; a five-minute
 * prompt-cache write is 1.25× the input price and a cache read a tenth of
 * it) — shared by the live log line and the durable wine_events cost records
 * so the two can never disagree.
 */
const PRICE_PER_MTOK = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };

/**
 * `inputTokens` is ALL the input a call processed — uncached, written to the
 * prompt cache and read from it (`claudeInputTokens` adds up the three parts
 * the API reports apart); the cache parts are priced at their own rates.
 * Called with two arguments it is the table it always was.
 */
export function estimateClaudeCostUSD(inputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0) {
  const read = cacheReadTokens || 0;
  const write = cacheWriteTokens || 0;
  const uncached = Math.max(0, (inputTokens || 0) - read - write);
  const usd = (
    uncached * PRICE_PER_MTOK.input +
    write * PRICE_PER_MTOK.cacheWrite +
    read * PRICE_PER_MTOK.cacheRead +
    (outputTokens || 0) * PRICE_PER_MTOK.output
  ) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}

/**
 * The input one call processed. With prompt caching the API reports it in
 * three parts — `input_tokens` is only what came AFTER the last cache
 * breakpoint — so `total` adds them back up: the number every cost record
 * has always called input, comparable across the change.
 */
export function claudeInputTokens(usage) {
  const n = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  const cacheRead = n(usage?.cache_read_input_tokens);
  const cacheWrite = n(usage?.cache_creation_input_tokens);
  return { total: n(usage?.input_tokens) + cacheRead + cacheWrite, cacheRead, cacheWrite };
}

/**
 * One structured log line per Claude call — the live-debugging view of cost
 * (wine_events.somm_curation / narrative_regenerated are the durable one).
 * `cacheReadTokens` / `cacheWriteTokens` say whether the prompt cache
 * engaged: both 0 on a route that asked for it means it didn't (the API
 * caches nothing under its minimum length and says nothing about it).
 */
export function logClaudeUsage(route, usage, ms) {
  if (!usage) return;
  const { total: inputTokens, cacheRead: cacheReadTokens, cacheWrite: cacheWriteTokens } = claudeInputTokens(usage);
  const outputTokens = usage.output_tokens || 0;
  const estCostUSD = estimateClaudeCostUSD(inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);
  console.log(
    JSON.stringify({ type: "claude_usage", route, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, estCostUSD, ms })
  );
}
