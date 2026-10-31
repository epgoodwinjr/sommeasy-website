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
 * Record a request and decide whether it may proceed.
 * Returns { allowed: true } or { allowed: false, retryAfterSec }.
 */
export function checkRateLimit(route, ip) {
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

  if (stamps.length >= MAX_REQUESTS) {
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
 * The one price table (Sonnet-class: $3/MTok in, $15/MTok out) — shared by
 * the live log line and the durable wine_events cost records so the two can
 * never disagree.
 */
export function estimateClaudeCostUSD(inputTokens, outputTokens) {
  return Math.round(((inputTokens || 0) * 3 + (outputTokens || 0) * 15) / 1e6 * 1e6) / 1e6;
}

/**
 * One structured log line per Claude call — the live-debugging view of cost
 * (wine_events.somm_curation / narrative_regenerated are the durable one).
 */
export function logClaudeUsage(route, usage, ms) {
  if (!usage) return;
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const estCostUSD = estimateClaudeCostUSD(inputTokens, outputTokens);
  console.log(
    JSON.stringify({ type: "claude_usage", route, inputTokens, outputTokens, estCostUSD, ms })
  );
}
