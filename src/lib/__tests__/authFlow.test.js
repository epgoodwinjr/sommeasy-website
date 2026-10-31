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
  const {
    sanitizeNext, interpretSignUpResult, isValidOtpType, VALID_OTP_TYPES, isOtpNoAccountError,
    validateSignup, cleanName, NAME_MAX,
  } = await import("../authFlow.js");
  const { AUTH_ERRORS, AUTH_MESSAGES, mapAuthError, authErrorCopy, authNoticeCopy, welcomeNoticeCopy } =
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
    // Heuristic: actionable copy contains a verb of action or direction —
    // or names exactly what's needed ("We need all three…": the fix is
    // the sentence)
    const actionable = /try|sign in|reset|check|request|give it|pick|ignore|moment|type it|we need/i;
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
    [{ message: "Password should be at least 8 characters.", status: 422 }, "weak_password"],
    [{ message: "New password should be different from the old password.", status: 422 }, "same_password"],
    [{ message: "Unable to validate email address: invalid format", status: 400 }, "invalid_email"],
    [{ message: "Email address \"x@y\" is invalid", status: 400 }, "invalid_email"],
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

  console.log("\n═══ Session 3 — magic link + password policy copy ═══");

  test("magic_sent copy is anti-enumeration (same conditional phrasing as reset)", () => {
    const copy = AUTH_MESSAGES.magic_sent("x@y.com");
    assert(/if that email has an account/i.test(copy), "conditional phrasing required");
    assert(copy.includes("x@y.com"), "shows the address");
    assert(/sign-in link/i.test(copy), "names what was sent");
  });

  test("a failed sign-out has its own copy — never a raw provider string", () => {
    assert(typeof AUTH_ERRORS.sign_out_failed === "string", "sign_out_failed exists");
    assert(/sign you out/i.test(AUTH_ERRORS.sign_out_failed), "names what failed");
    assert(/try again/i.test(AUTH_ERRORS.sign_out_failed), "says what to do next");
  });

  test("the ?notice= landing renders only known notices (House List: signed out)", () => {
    assert(authNoticeCopy("signed_out") === "✓ Signed out", "signed_out copy");
    assert(authNoticeCopy("not_a_notice") === null, "unknown keys render nothing, never the raw param");
    assert(authNoticeCopy(undefined) === null && authNoticeCopy("") === null, "absent param");
  });

  test("password_helper and magic_needs_email exist with the 8-char policy", () => {
    assert(AUTH_MESSAGES.password_helper === "At least 8 characters.", "helper copy");
    assert(/8 characters/.test(AUTH_ERRORS.weak_password), "weak_password names 8");
    assert(!/6 characters/.test(AUTH_ERRORS.weak_password), "no stale 6-char copy");
    assert(typeof AUTH_ERRORS.magic_needs_email === "string" && AUTH_ERRORS.magic_needs_email.length > 20, "magic_needs_email");
  });

  console.log("\n═══ The House List, Phase 6 — create account + Account ═══");

  test("create account asks for all three — a name, an email, a password — in brand voice", () => {
    assert(AUTH_ERRORS.signup_missing_fields
      === "We need all three to save your palate — a name, an email and a password.", "README §8.9 copy");
    const ok = { name: "Edward", email: "ed@example.com", password: "longenough" };
    assert(validateSignup(ok) === null, "complete → no error");
    for (const missing of ["name", "email", "password"]) {
      assert(validateSignup({ ...ok, [missing]: "" }) === "signup_missing_fields", `no ${missing}`);
    }
    assert(validateSignup({ ...ok, name: "   " }) === "signup_missing_fields", "a blank name is no name");
    assert(validateSignup({ ...ok, email: "  " }) === "signup_missing_fields", "a blank email is no email");
    assert(validateSignup({}) === "signup_missing_fields" && validateSignup(null) === "signup_missing_fields", "junk");
  });

  test("create account checks the email's shape and the 8-char policy before asking Supabase", () => {
    const ok = { name: "Edward", email: "ed@example.com", password: "longenough" };
    for (const bad of ["ed", "ed@", "@example.com", "ed@example", "ed example@x.com"]) {
      assert(validateSignup({ ...ok, email: bad }) === "invalid_email", `"${bad}" isn't an email`);
    }
    assert(validateSignup({ ...ok, email: "  ed@example.com " }) === null, "surrounding space is forgiven");
    assert(validateSignup({ ...ok, password: "short77" }) === "weak_password", "7 characters");
    assert(validateSignup({ ...ok, password: "eight888" }) === null, "8 is enough");
    assert(/check it/i.test(AUTH_ERRORS.invalid_email), "invalid_email says what to do");
  });

  test("a name is trimmed and capped at 60 — what the Somm calls you", () => {
    assert(cleanName("  Edward  ") === "Edward", "trimmed");
    assert(cleanName("x".repeat(80)).length === NAME_MAX && NAME_MAX === 60, "capped at 60");
    assert(cleanName(null) === "" && cleanName(42) === "", "junk → empty");
  });

  test("Account's copy: the delete failure, the reset-link toast, the closed-account line", () => {
    assert(AUTH_ERRORS.account_delete_failed
      === "We couldn’t close your account just now. Give it a minute and try again.", "README §8.8.4 copy");
    assert(/sign in/i.test(AUTH_ERRORS.session_missing), "a signed-out request says to sign in");
    assert(AUTH_MESSAGES.reset_link_toast === "✓ Check your inbox — a reset link is on its way", "README §8.8 toast");
    assert(AUTH_MESSAGES.quiz_comes_with_you === "Your quiz answers come with you.", "README §8.9 line");
    assert(welcomeNoticeCopy("account_deleted") === "Your account is closed. Everything in it is gone.", "README §8.8.4");
    assert(welcomeNoticeCopy("signed_out") === null && welcomeNoticeCopy("nope") === null && welcomeNoticeCopy() === null,
      "the Welcome screen renders only its own notice");
    assert(authNoticeCopy("account_deleted") === null, "…and sign in never renders it");
  });

  test("isOtpNoAccountError detects the shouldCreateUser:false rejection", () => {
    assert(isOtpNoAccountError({ message: "Signups not allowed for otp", status: 422 }), "by message");
    assert(isOtpNoAccountError({ code: "otp_disabled", message: "anything" }), "by code");
    assert(isOtpNoAccountError({ error_code: "otp_disabled" }), "by error_code");
    assert(!isOtpNoAccountError({ message: "For security purposes, wait", status: 429 }), "rate limit is NOT a no-account");
    assert(!isOtpNoAccountError({ message: "fetch failed" }), "network is NOT a no-account");
    assert(!isOtpNoAccountError(null), "null");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
