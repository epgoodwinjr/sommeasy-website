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

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
