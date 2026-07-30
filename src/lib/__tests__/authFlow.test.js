// Auth flow + copy test suite — Session 1 (The Front Door)
// Run with: node src/lib/__tests__/authFlow.test.js
//
// Tests the REAL modules (authFlow.js and authCopy.js are dependency-free
// ESM, loaded via dynamic import — no mirror drift).

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); }

async function main() {
  const { sanitizeNext, interpretSignUpResult, isValidOtpType, VALID_OTP_TYPES } =
    await import("../authFlow.js");
  const { AUTH_ERRORS, AUTH_MESSAGES, mapAuthError, authErrorCopy } =
    await import("../authCopy.js");

  console.log("\n═══ sanitizeNext — open-redirect kill table ═══");

  const NUL = String.fromCharCode(0);
  const LF = String.fromCharCode(10);
  const CR = String.fromCharCode(13);
  const BS = String.fromCharCode(92); // backslash

  const passthrough = [
    "/",
    "/palate",
    "/update-password",
    "/journal?tab=timeline",
    "/recommend",
    "/?quiz=refine",
  ];
  for (const p of passthrough) {
    test(`passes through ${JSON.stringify(p)}`, () => {
      assert(sanitizeNext(p) === p, `expected ${p}, got ${sanitizeNext(p)}`);
    });
  }

  const rejected = [
    ["@evil.com", "no leading slash"],
    ["//evil.com", "protocol-relative"],
    ["/" + BS + "evil.com", "backslash after slash"],
    ["/a" + BS + "b", "embedded backslash"],
    ["https://evil.com", "absolute URL"],
    ["http://evil.com", "absolute http URL"],
    ["javascript:alert(1)", "javascript scheme"],
    ["/a:b", "colon in path"],
    ["/a" + NUL + "b", "NUL control char"],
    ["/a" + LF + "b", "LF control char (header injection)"],
    ["/a" + CR + "b", "CR control char (header injection)"],
    ["", "empty string"],
    ["evil", "relative path"],
  ];
  for (const [input, label] of rejected) {
    test(`rejects ${label} → "/"`, () => {
      assert(sanitizeNext(input) === "/", `expected "/", got ${JSON.stringify(sanitizeNext(input))}`);
    });
  }

  test('rejects null → "/"', () => assert(sanitizeNext(null) === "/", "null"));
  test('rejects undefined → "/"', () => assert(sanitizeNext(undefined) === "/", "undefined"));
  test('rejects non-string (42) → "/"', () => assert(sanitizeNext(42) === "/", "number"));
  test('rejects object → "/"', () => assert(sanitizeNext({}) === "/", "object"));

  console.log("\n═══ interpretSignUpResult — the four outcomes ═══");

  test("error passes through as error kind", () => {
    const r = interpretSignUpResult(null, { message: "boom", status: 500 });
    assert(r.kind === "error", `got ${r.kind}`);
    assert(r.error.message === "boom", "error object carried");
  });

  test("session present → signed_in (no email theater)", () => {
    const r = interpretSignUpResult({ session: { access_token: "x" }, user: { id: "u" } }, null);
    assert(r.kind === "signed_in", `got ${r.kind}`);
  });

  test("identities === [] → already_registered (Supabase fake success)", () => {
    const r = interpretSignUpResult({ session: null, user: { id: "u", identities: [] } }, null);
    assert(r.kind === "already_registered", `got ${r.kind}`);
  });

  test("identities with entries → check_email", () => {
    const r = interpretSignUpResult({ session: null, user: { id: "u", identities: [{ id: "i" }] } }, null);
    assert(r.kind === "check_email", `got ${r.kind}`);
  });

  test("user without identities field → check_email", () => {
    const r = interpretSignUpResult({ session: null, user: { id: "u" } }, null);
    assert(r.kind === "check_email", `got ${r.kind}`);
  });

  test("empty response → error kind (never a false success)", () => {
    const r = interpretSignUpResult(null, null);
    assert(r.kind === "error", `got ${r.kind}`);
    const r2 = interpretSignUpResult({}, null);
    assert(r2.kind === "error", `got ${r2.kind}`);
  });

  console.log("\n═══ isValidOtpType ═══");

  for (const t of ["signup", "recovery", "magiclink", "email_change"]) {
    test(`accepts ${t}`, () => assert(isValidOtpType(t), t));
  }
  test("rejects unknown / missing types", () => {
    assert(!isValidOtpType("hax"), "hax");
    assert(!isValidOtpType(""), "empty");
    assert(!isValidOtpType(null), "null");
    assert(!isValidOtpType(undefined), "undefined");
  });
  test("VALID_OTP_TYPES stays in sync with isValidOtpType", () => {
    for (const t of VALID_OTP_TYPES) assert(isValidOtpType(t), t);
  });

  console.log("\n═══ authCopy — brand voice error map ═══");

  test("every error key has non-empty brand copy", () => {
    const keys = Object.keys(AUTH_ERRORS);
    assert(keys.length >= 8, `only ${keys.length} keys`);
    for (const k of keys) {
      assert(typeof AUTH_ERRORS[k] === "string" && AUTH_ERRORS[k].length > 20, `${k} too short`);
    }
  });

  test("no raw Supabase strings leak into the copy", () => {
    const rawPhrases = [
      "Invalid login credentials",
      "For security purposes",
      "provider is not enabled",
      "Email link is invalid",
      "code verifier",
      "AuthApiError",
    ];
    const allCopy = Object.values(AUTH_ERRORS).join(" ") + " " +
      Object.values(AUTH_MESSAGES).map((v) => (typeof v === "function" ? v("x@y.com") : v)).join(" ");
    for (const phrase of rawPhrases) {
      assert(!allCopy.includes(phrase), `raw phrase leaked: ${phrase}`);
    }
  });

  test("every error copy tells the user what to do next (CLAUDE.md voice rule)", () => {
    // Heuristic: actionable copy contains a verb of action or direction
    const actionable = /try|sign in|reset|check|request|give it|pick|ignore|moment/i;
    for (const [k, copy] of Object.entries(AUTH_ERRORS)) {
      assert(actionable.test(copy), `${k} copy has no next step: "${copy}"`);
    }
  });

  const mappings = [
    [{ message: "Invalid login credentials", status: 400 }, "wrong_credentials"],
    [{ message: "Email not confirmed", status: 400 }, "unconfirmed_email"],
    [{ message: "For security purposes, you can only request this after 42 seconds.", status: 429 }, "rate_limit"],
    [{ message: "Anything", status: 429 }, "rate_limit"],
    [{ message: "Email rate limit exceeded", status: 400 }, "rate_limit"],
    [{ name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 }, "network"],
    [{ message: "fetch failed" }, "network"],
    [{ message: "Email link is invalid or has expired", status: 403 }, "link_expired"],
    [{ message: "Token has expired or is invalid", status: 403 }, "link_expired"],
    [{ message: "Password should be at least 6 characters.", status: 422 }, "weak_password"],
    [{ message: "New password should be different from the old password.", status: 422 }, "same_password"],
    [{ message: "some totally novel failure", status: 500 }, "unknown"],
  ];
  for (const [err, want] of mappings) {
    test(`maps "${err.message.slice(0, 44)}" → ${want}`, () => {
      const got = mapAuthError(err);
      assert(got === want, `got ${got}`);
    });
  }

  test("mapAuthError(null) → null (no phantom errors)", () => {
    assert(mapAuthError(null) === null, "null in, null out");
  });

  test("authErrorCopy falls back to the generic copy for unknown keys", () => {
    assert(authErrorCopy("not_a_key") === AUTH_ERRORS.unknown, "fallback");
    assert(authErrorCopy("wrong_credentials") === AUTH_ERRORS.wrong_credentials, "known key");
  });

  test("anti-enumeration reset copy never confirms account existence", () => {
    assert(/if that email has an account/i.test(AUTH_MESSAGES.reset_sent), "conditional phrasing required");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
