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
const MAX_REQUESTS = 10;          // per IP, per route, per window

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
  // Playwright drives real scans against a dev server — don't throttle test runs
  if (process.env.NODE_ENV === "test") return { allowed: true };

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
 * One structured log line per Claude call — Vercel logs are the cost
 * dashboard for now. Sonnet-class pricing: $3/MTok in, $15/MTok out.
 */
export function logClaudeUsage(route, usage, ms) {
  if (!usage) return;
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const estCostUSD =
    Math.round((inputTokens * 3 + outputTokens * 15) / 1e6 * 1e6) / 1e6;
  console.log(
    JSON.stringify({ type: "claude_usage", route, inputTokens, outputTokens, estCostUSD, ms })
  );
}
