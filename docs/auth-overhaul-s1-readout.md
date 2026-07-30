# Session 1 Readout — "The Front Door" (auth core)

**Executed by Claude Code, July 30, 2026, against `docs/auth-overhaul-brief.md` §4 Session 1.**
For Cowork's independent post-review. Scope was Session 1 only — Sessions 2/3/4 untouched.

## Verification summary

| Check | Result |
|---|---|
| `npm run build` | ✅ clean — both auth routes dynamic (ƒ), middleware bundled (73.9 kB), all pages compile |
| `node src/lib/__tests__/dnaEvolution.test.js` | ✅ 51/51 |
| `node src/lib/__tests__/countryAttribution.test.js` | ✅ 14/14 |
| `node src/lib/__tests__/sommPicks.test.js` | ✅ 24/24 |
| `node src/lib/__tests__/authFlow.test.js` (new) | ✅ 53/53 |
| `node src/lib/__tests__/authRoutes.test.js` (new) | ✅ 21/21 |
| `npm run test:e2e` | ✅ 42/42 (32 existing + 10 new; env-gated seeder skipped as always) |
| Visual check (dev) | ✅ `/login?error=link_expired&email=…` renders copy + prefill; `/forgot-password`, `/update-password` on-brand; zero console errors |
| Account rules | ✅ No real users created (all e2e auth mutations Playwright-intercepted); Ed's account and `33430bb8…` untouched |

## What changed (defect register → fix)

### Defect 1 (CRITICAL): callback could never establish a session
- **`src/lib/supabaseRoute.js` (new):** `createRouteClient(request)` — `createServerClient` with a cookie-**collecting** `setAll`; `applyCookies(response)` stamps the buffered cookies onto whichever redirect we end up building. This is the cookie-writing adapter the brief demanded (the palate-narrative read-only pattern, made writable).
- **`src/app/api/auth/confirm/route.js` (new):** token_hash landing — validates `type` against an allowlist ([authFlow.js:47](src/lib/authFlow.js)), `verifyOtp` at [confirm/route.js:51](src/app/api/auth/confirm/route.js), session cookies onto the redirect. `type=recovery` defaults `next` to `/update-password`. Tolerates a stray `?code=` (line 35) so a redirectTo pointed here during the template-transition era still works.
- **`src/app/api/auth/callback/route.js` (rewritten):** PKCE exchange with the same adapter — **`?code=` from the CURRENT dashboard templates keeps working same-browser**, per the brief. Provider/verify errors arriving as `?error=…&error_code=…` are mapped ([callback/route.js:28-33](src/app/api/auth/callback/route.js)): `otp_expired → link_expired`, else `exchange_failed`.
- Failure landings: **always** `/login?error=<link_expired|exchange_failed>` + `[auth] … failed: <reason>` console line. The silent `?error=auth` bounce is gone.

### Defect 8 (open redirect): killed
- **[authFlow.js:10](src/lib/authFlow.js) `sanitizeNext`:** must start with a single `/`; rejects `//`, anything containing `\` or `:`, and (beyond the brief's list) control characters — CR/LF would otherwise be a header-injection vector. Non-conforming input falls back to `/`. Route tests probe `//evil.com`, `https://evil.com`, `/\evil.com`, `@evil.com` through both live routes.

### Defect 9 (refresh-token rotation loss): fixed
- **`src/middleware.js` (new):** standard `@supabase/ssr` refresh ([middleware.js:33](src/middleware.js)), matcher excludes `_next/*` + static extensions, graceful no-op when env vars are absent (build-time safety).
- **[palate-narrative/route.js:50](src/app/api/palate-narrative/route.js):** `setAll` now writes rotated cookies (try/catch per Supabase docs pattern).

### Defects 4, 7, 10 (AuthForm lies, hangs, leaks raw strings): rebuilt
- **`src/lib/authCopy.js` (new):** the single source for ALL auth copy — 10 error keys + message states; `mapAuthError` maps Supabase errors → keys ([authCopy.js:47](src/lib/authCopy.js)). Unit tests assert no raw Supabase phrases leak and every copy names a next step.
- **`src/lib/authFlow.js` `interpretSignUpResult` ([authFlow.js:33](src/lib/authFlow.js)):** four explicit outcomes. In `AuthForm` ([AuthForm.js:73-84](src/components/AuthForm.js)): `identities.length === 0` → dedicated already-registered state (brief's copy verbatim, sign-in + reset links carrying the email); `data.session` → straight in, no email theater; real signup → check-your-inbox state (address + spam note + **Resend** gated by a 60s countdown, [AuthForm.js:94](src/components/AuthForm.js)); resend rate-limit surfaces as brand copy.
- Submit is try/catch/finally — `loading` always clears; thrown fetch failures get the "couldn't reach our cellar" copy.
- Login reads `?error` + `?email` ([AuthForm.js:37-40](src/components/AuthForm.js)); unknown/legacy values (e.g. old `?error=auth`) render the generic brand copy. Login/signup pages wrap `AuthForm` in `Suspense` (Next 14 `useSearchParams` prerender requirement).
- Unconfirmed-email login errors carry a resend affordance ([AuthForm.js:121-122](src/components/AuthForm.js)) that only moves to the inbox state if the resend actually went out.

### Defect 2 (no password reset): full flow shipped
- **`/forgot-password`** (`src/components/ForgotPasswordForm.js`): `resetPasswordForEmail` with `redirectTo → /api/auth/callback?next=/update-password`; anti-enumeration copy verbatim from the brief — only rate-limit/network errors surface, anything else still shows the neutral "if that email has an account" state.
- **`/update-password`** (`src/components/UpdatePasswordForm.js`): requires the recovery session (no session → honest guidance + "Request a reset link", not a doomed form); password visibility toggle from day one; `updateUser` → quiet confirmation beat → lands signed-in on `/`. Added `weak_password`/`same_password` copy keys for its failure modes.
- "Forgot your password?" link under the login password field, email carried over.

### Defect 3 (Google button while provider disabled): honest
- Renders only when `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1` ([AuthForm.js:14](src/components/AuthForm.js)); flag is nowhere set, so it is OFF everywhere until §5 dashboard work lands. Pending/disabled state ("Opening Google…") ready for when it goes live. e2e asserts the button is absent on both pages.

### Email templates (§5 item 4)
- `docs/email-templates/` — `confirm-signup.html`, `reset-password.html`, `magic-link.html`, `email-change.html` + README (paste instructions, sequencing/rollback notes, suggested subjects). All buttons use `{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=…&next=…`; recovery hardcodes `next=/update-password`. **Flip together with this deploy** — until then, old ConfirmationURL links work same-browser via the callback.

### Shared shell
- `src/components/AuthShell.js` (new): the logo/card/typography shell + style vocabulary, reused by all four auth screens so the brand identity lives in one place.
- `src/lib/supabase.js`: build-time stub extended with `getUser`/`resetPasswordForEmail`/`updateUser`/`resend` (parity only; the real stub redesign stays Session 4).

## Tests added

- **`authFlow.test.js` (53):** `sanitizeNext` table incl. the brief's `@evil.com`, `//evil.com`, `/\evil.com` + control chars/null/non-strings; all four `interpretSignUpResult` outcomes; OTP-type allowlist; error map completeness, no-raw-strings, next-step voice heuristic, all `mapAuthError` mappings.
- **`authRoutes.test.js` (21):** tests the **real route modules** — a `module.register` resolve hook (`helpers/alias-loader.mjs`) handles `@/` + `next/server` in plain node, and GoTrue is a scripted `globalThis.fetch`. Asserts `Set-Cookie` (`sb-…-auth-token`) is present on success redirects for both routes, open-redirect probes bounce to `/`, all failure reasons land on `/login?error=…`, and — the original bug, exactly — a `?code=` without the verifier cookie now produces a *visible* `exchange_failed` landing.
- **`e2e/auth-flows.spec.ts` (10):** all `/auth/v1/*` mutations intercepted (CORS preflights handled), **no real users**. Includes the new permanent **hard-fail signup guard** (check-inbox state must appear with the gated resend), already-registered branch, wrong-password brand copy (raw string asserted absent + button recovers), `?error` landings (incl. legacy `?error=auth`), anti-enumeration reset, signed-out `/update-password` guidance, Google-hidden assertions, and the update-password flow (seeded session; `PUT /auth/v1/user` intercepted so the e2e account's password is never changed).

## Deviations from the brief (all additive or explicitly deferred)

1. `sanitizeNext` also rejects control characters (header-injection defense) — stricter than §4.1's list.
2. `/api/auth/confirm` tolerates `?code=` as a transition-era fallback (§4.1 described it as token_hash-only).
3. Two extra copy keys (`weak_password`, `same_password`) beyond §4.3's six — `/update-password` needed them.
4. `[auth] … failed:` structured failure logs added now (Session 4 formalizes the counting ritual).
5. Stub-client parity additions (full stub fix remains Session 4 scope).
6. The e2e update-password spec uses the seeded session with an intercepted `PUT` rather than a recovery-link session — a real recovery session would need a real email round trip (that's Cowork's §6 manual canary).
7. Middleware matcher follows the standard Supabase pattern and therefore includes `/api/*` routes — adds one `getUser` validation call per authenticated API request; judged acceptable, flagging for awareness.
8. Left for their planned sessions: `minLength` stays 6 (S3 raises with dashboard policy), labels/autocomplete/a11y/`next/link`/logo-home-link (S3), login destination preservation (S2), magic-link UI (S3 — the confirm route already handles `type=magiclink`).

## What Ed/Cowork must do (outside the repo — brief §5)

1. Paste the four templates from `docs/email-templates/` into Auth → Email Templates **together with this deploy**.
2. Site URL → `https://sommeasy.wine`; redirect allowlist → `/api/auth/confirm` + `/api/auth/callback` (+ localhost + previews).
3. Custom SMTP (launch blocker — built-in is ~2-4 emails/hr).
4. Google provider + OAuth client, THEN set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1` in Vercel.
5. §6 S1 verification: fresh `epgoodwin+e2e-signup-<date>@gmail.com` prod signup → confirm → lands signed in; reset round-trip; open-redirect probes; `?error` landing screenshot.
