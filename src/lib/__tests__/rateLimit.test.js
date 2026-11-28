// Rate limiter test suite — the e2e bypass and its production guard
// Run with: node src/lib/__tests__/rateLimit.test.js
//
// checkRateLimit reads process.env on every call, so each case runs in the
// environment it names. (Under Next, `process.env.NODE_ENV` is a build-time
// literal — "development" in `next dev`, "production" in a build — while
// plain node reads the real variable, which is what lets these cases stand
// in for both.) Every case gets its own bucket, so none can starve another.

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); }

// Run fn with exactly these env vars set (undefined = unset), then restore.
function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  const apply = (v) => {
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) delete process.env[k];
      else process.env[k] = val;
    }
  };
  apply(vars);
  try { return fn(); } finally { apply(saved); }
}

// Fire `count` requests at a fresh bucket; the 1-based index of the first
// refusal, or 0 if every request was allowed.
let bucketSeq = 0;
function firstRefusal(checkRateLimit, count) {
  const route = `rate-limit-test-${++bucketSeq}`;
  for (let i = 1; i <= count; i++) {
    const r = checkRateLimit(route, "203.0.113.7");
    if (!r.allowed) {
      assert(Number.isInteger(r.retryAfterSec) && r.retryAfterSec > 0,
        `a refusal must carry a positive Retry-After, got ${JSON.stringify(r)}`);
      return i;
    }
  }
  return 0;
}

async function main() {
  const { checkRateLimit, MAX_REQUESTS } = await import("../rateLimit.js");
  // Every bound below is built on the real limit — without it, the "never
  // throttled" cases would pass on zero requests.
  if (!Number.isInteger(MAX_REQUESTS) || MAX_REQUESTS < 1) {
    throw new Error(`MAX_REQUESTS must be exported as a positive integer, got ${MAX_REQUESTS}`);
  }
  const OVER = MAX_REQUESTS + 1;

  console.log("\n═══ rateLimit — throttled unless explicitly switched off ═══");

  // Production throttles exactly as it always has, and the e2e switch is
  // inert there. (A production build also compiles the bypass away — this
  // pins the source-level guard behind that.) Without an explicit signal,
  // every other environment throttles the same way.
  const throttled = [
    ["production, flag unset", { NODE_ENV: "production", E2E_DISABLE_RATE_LIMIT: undefined }],
    ["production ignores E2E_DISABLE_RATE_LIMIT=1", { NODE_ENV: "production", E2E_DISABLE_RATE_LIMIT: "1" }],
    ["a plain `next dev` (development, flag unset)", { NODE_ENV: "development", E2E_DISABLE_RATE_LIMIT: undefined }],
    ["plain node (NODE_ENV unset, flag unset)", { NODE_ENV: undefined, E2E_DISABLE_RATE_LIMIT: undefined }],
    // Fail closed: only the exact value "1" is the switch
    ['development + E2E_DISABLE_RATE_LIMIT="0"', { NODE_ENV: "development", E2E_DISABLE_RATE_LIMIT: "0" }],
    ['development + E2E_DISABLE_RATE_LIMIT="false"', { NODE_ENV: "development", E2E_DISABLE_RATE_LIMIT: "false" }],
    ['development + E2E_DISABLE_RATE_LIMIT="true"', { NODE_ENV: "development", E2E_DISABLE_RATE_LIMIT: "true" }],
    ['development + E2E_DISABLE_RATE_LIMIT=""', { NODE_ENV: "development", E2E_DISABLE_RATE_LIMIT: "" }],
  ];
  for (const [label, env] of throttled) {
    await test(`${label}: request ${OVER} is refused`, () => {
      const at = withEnv(env, () => firstRefusal(checkRateLimit, OVER));
      assert(at === OVER, `first refusal at request ${at}, want ${OVER}`);
    });
  }

  // The bypass: the dev server playwright.config.ts launches, and plain-node
  // harnesses that import a route handler directly.
  const bypassed = [
    ["the e2e dev server (development + E2E_DISABLE_RATE_LIMIT=1)", { NODE_ENV: "development", E2E_DISABLE_RATE_LIMIT: "1" }],
    ["a plain-node harness with E2E_DISABLE_RATE_LIMIT=1 (NODE_ENV unset)", { NODE_ENV: undefined, E2E_DISABLE_RATE_LIMIT: "1" }],
    ["a plain-node harness with NODE_ENV=test", { NODE_ENV: "test", E2E_DISABLE_RATE_LIMIT: undefined }],
  ];
  for (const [label, env] of bypassed) {
    await test(`${label} is never throttled`, () => {
      const at = withEnv(env, () => firstRefusal(checkRateLimit, 3 * MAX_REQUESTS));
      assert(at === 0, `refused at request ${at} — want no refusal in ${3 * MAX_REQUESTS}`);
    });
  }

  // A route may allow more than MAX_REQUESTS (/api/lists, Nov 27, 2026);
  // junk for a limit is the default, never "no limit"
  await test("a route's own limit: request max+1 is refused; junk limits fall back to MAX_REQUESTS", () => {
    const env = { NODE_ENV: "production", E2E_DISABLE_RATE_LIMIT: undefined };
    const refusalAt = (max, count) => withEnv(env, () => {
      const route = `rate-limit-max-${++bucketSeq}`;
      for (let i = 1; i <= count; i++) if (!checkRateLimit(route, "203.0.113.8", max).allowed) return i;
      return 0;
    });
    assert(refusalAt(60, 70) === 61, `60 → refused at ${refusalAt(60, 70)}`);
    assert(refusalAt(3, 10) === 4, "3 → refused at 4");
    for (const junk of [0, -1, 2.5, NaN, "60", null]) {
      assert(refusalAt(junk, 3 * MAX_REQUESTS) === OVER, `${JSON.stringify(junk)} → the default limit`);
    }
  });

  // ─── The one price table, with the prompt cache (Nov 15, 2026) ───
  // Since the Somm's brief is cached the API reports a call's input in three
  // parts, and only the part after the breakpoint is `input_tokens`. Every
  // cost record keeps "input" meaning ALL of it and prices the cache parts
  // at their own rates; a call with no cache is priced as it always was.
  console.log("\n═══ the cost table — the prompt cache at its own rates ═══");
  const { estimateClaudeCostUSD, claudeInputTokens, logClaudeUsage } = await import("../rateLimit.js");

  await test("two arguments: the table it always was ($3 in, $15 out per MTok)", () => {
    assert(estimateClaudeCostUSD(2040, 525) === 0.013995, `got ${estimateClaudeCostUSD(2040, 525)}`);
    assert(estimateClaudeCostUSD(0, 0) === 0 && estimateClaudeCostUSD() === 0, "nothing costs nothing");
  });

  await test("a cache write costs 1.25× the input price and a read a tenth of it", () => {
    // 3,000 input of which 2,000 written: 1,000 × $3 + 2,000 × $3.75 + 100 × $15
    assert(estimateClaudeCostUSD(3000, 100, 0, 2000) === 0.012, `write: ${estimateClaudeCostUSD(3000, 100, 0, 2000)}`);
    // 3,000 input of which 2,000 read: 1,000 × $3 + 2,000 × $0.30 + 100 × $15
    assert(estimateClaudeCostUSD(3000, 100, 2000, 0) === 0.0051, `read: ${estimateClaudeCostUSD(3000, 100, 2000, 0)}`);
    assert(estimateClaudeCostUSD(3000, 100, 2000, 0) < estimateClaudeCostUSD(3000, 100), "a read is cheaper than no cache");
    assert(estimateClaudeCostUSD(3000, 100, 0, 2000) > estimateClaudeCostUSD(3000, 100), "a write costs more than no cache");
  });

  await test("the uncached part never goes negative, and junk prices as nothing", () => {
    // A total smaller than its cache parts (a caller's slip): only the parts count
    assert(estimateClaudeCostUSD(100, 0, 2000, 0) === 0.0006, `got ${estimateClaudeCostUSD(100, 0, 2000, 0)}`);
    assert(estimateClaudeCostUSD(NaN, null, undefined, null) === 0, "junk → 0");
  });

  await test("claudeInputTokens adds up the three parts the API reports apart", () => {
    const t = claudeInputTokens({ input_tokens: 700, cache_creation_input_tokens: 1350, cache_read_input_tokens: null, output_tokens: 9 });
    assert(t.total === 2050 && t.cacheWrite === 1350 && t.cacheRead === 0, JSON.stringify(t));
    const r = claudeInputTokens({ input_tokens: 700, cache_read_input_tokens: 1350 });
    assert(r.total === 2050 && r.cacheRead === 1350 && r.cacheWrite === 0, JSON.stringify(r));
    const plain = claudeInputTokens({ input_tokens: 1814, output_tokens: 605 });
    assert(plain.total === 1814 && plain.cacheRead === 0 && plain.cacheWrite === 0, "no cache fields: the input as it always was");
    for (const junk of [undefined, null, {}, { input_tokens: "lots", cache_read_input_tokens: -5 }]) {
      const j = claudeInputTokens(junk);
      assert(j.total === 0 && j.cacheRead === 0 && j.cacheWrite === 0, `junk ${JSON.stringify(junk)} → ${JSON.stringify(j)}`);
    }
  });

  await test("the usage line carries ALL the input, the cache parts, and their price", () => {
    const lines = [];
    const { log } = console;
    console.log = (line) => lines.push(line);
    try {
      logClaudeUsage("somm-picks", { input_tokens: 700, cache_read_input_tokens: 1350, output_tokens: 500 }, 1234);
      logClaudeUsage("scan-label", { input_tokens: 1600, output_tokens: 80 }, 900);
      logClaudeUsage("scan-label", null, 1);
    } finally { console.log = log; }
    assert(lines.length === 2, `one line per call with usage, got ${lines.length}`);
    const cached = JSON.parse(lines[0]);
    assert(cached.type === "claude_usage" && cached.route === "somm-picks" && cached.ms === 1234, lines[0]);
    assert(cached.inputTokens === 2050 && cached.cacheReadTokens === 1350 && cached.cacheWriteTokens === 0 && cached.outputTokens === 500, lines[0]);
    // 700 × $3 + 1,350 × $0.30 + 500 × $15 per MTok
    assert(cached.estCostUSD === 0.010005, `price ${cached.estCostUSD}`);
    const plain = JSON.parse(lines[1]);
    assert(plain.inputTokens === 1600 && plain.cacheReadTokens === 0 && plain.cacheWriteTokens === 0 && plain.estCostUSD === 0.006, lines[1]);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
