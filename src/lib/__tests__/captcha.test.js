// Captcha scaffold test suite — Session 4
// Run with: node src/lib/__tests__/captcha.test.js
//
// The feature is dark by default; these tests pin the "nothing breaks when
// the flag is absent" contract and the fail-open behavior.

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

async function main() {
  const { isCaptchaEnabled, verifyCaptchaToken, CAPTCHA_REQUIRED_MESSAGE } =
    await import("../captcha.js");

  console.log("\n═══ captcha — dark by default ═══");

  await test("disabled by default (flag absent)", () => {
    delete process.env.NEXT_PUBLIC_CAPTCHA_ENABLED;
    assert(isCaptchaEnabled() === false, "should be off");
  });

  await test("verify is a pass-through no-op when disabled — even with no token", async () => {
    delete process.env.NEXT_PUBLIC_CAPTCHA_ENABLED;
    const r = await verifyCaptchaToken(undefined);
    assert(r.ok === true && r.skipped === true, `got ${JSON.stringify(r)}`);
  });

  await test("enabled but no server secret → fails OPEN (never walls off signups)", async () => {
    process.env.NEXT_PUBLIC_CAPTCHA_ENABLED = "1";
    delete process.env.TURNSTILE_SECRET_KEY;
    const r = await verifyCaptchaToken("some-token");
    assert(r.ok === true && r.skipped === true, `got ${JSON.stringify(r)}`);
    delete process.env.NEXT_PUBLIC_CAPTCHA_ENABLED;
  });

  await test("enabled + secret + missing token → not ok (missing_token)", async () => {
    process.env.NEXT_PUBLIC_CAPTCHA_ENABLED = "1";
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const r = await verifyCaptchaToken("");
    assert(r.ok === false && r.reason === "missing_token", `got ${JSON.stringify(r)}`);
    delete process.env.NEXT_PUBLIC_CAPTCHA_ENABLED;
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  await test("verified token passes against a stubbed Cloudflare", async () => {
    process.env.NEXT_PUBLIC_CAPTCHA_ENABLED = "1";
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });
    try {
      const r = await verifyCaptchaToken("good-token");
      assert(r.ok === true && !r.skipped, `got ${JSON.stringify(r)}`);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.NEXT_PUBLIC_CAPTCHA_ENABLED;
      delete process.env.TURNSTILE_SECRET_KEY;
    }
  });

  await test("rejected token → not ok with the error codes", async () => {
    process.env.NEXT_PUBLIC_CAPTCHA_ENABLED = "1";
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), { status: 200 });
    try {
      const r = await verifyCaptchaToken("bad-token");
      assert(r.ok === false && /invalid-input-response/.test(r.reason), `got ${JSON.stringify(r)}`);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.NEXT_PUBLIC_CAPTCHA_ENABLED;
      delete process.env.TURNSTILE_SECRET_KEY;
    }
  });

  await test("Cloudflare outage fails OPEN (logged, not a lockout)", async () => {
    process.env.NEXT_PUBLIC_CAPTCHA_ENABLED = "1";
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("network down"); };
    try {
      const r = await verifyCaptchaToken("any-token");
      assert(r.ok === true && r.skipped === true, `got ${JSON.stringify(r)}`);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.NEXT_PUBLIC_CAPTCHA_ENABLED;
      delete process.env.TURNSTILE_SECRET_KEY;
    }
  });

  await test("has brand-voice required copy for when it goes live", () => {
    assert(typeof CAPTCHA_REQUIRED_MESSAGE === "string" && CAPTCHA_REQUIRED_MESSAGE.length > 20, "copy present");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
