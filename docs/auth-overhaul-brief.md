# The Front Door — Auth & Entry-Funnel Overhaul (Design Brief)

**Written by Cowork, July 30, 2026. Claude Code executes; Cowork verifies each session against the live DB, auth logs, and repo — same workflow as Palate Act II.**

Ed's bar: **best-in-class, polished, seamless**. This is the launch blocker before sharing Sommeasy with people. The product behind the door (quiz, reveal, palate, Somm) is already strong; the door itself is broken.

---

## 1. What actually happened (verified forensics, not conjecture)

A real user (Ed's wife) tried to use the product on July 29. Cowork traced every step in the Supabase auth logs for project `zugunlctgpytgyxftllv` and cross-checked `auth.users`. Times UTC:

| Time (Jul 29) | Auth log event | What she experienced |
|---|---|---|
| 19:52:01–:33 | 4× `POST /token 400: Invalid login credentials` | Tried her old account. **It doesn't exist here** — it lived on the original Feb-2026 Supabase project destroyed in the March pause incident (`keepalive/route.js:8-11`). |
| 19:52:16, :20 | 2× `/authorize 400: provider is not enabled` | Clicked **Continue with Google** twice. The button is rendered (`AuthForm.js:71`) but the Google provider is **not enabled** in Supabase — raw error string shown. |
| 19:53:00 | `/signup 200 user_confirmation_requested` + `mail.send` | Gave up, completed the DNA quiz anonymously, clicked create account. Signup itself worked; confirmation email sent. **Her quiz results were already destroyed** the moment she navigated to /signup (React state only, `Quiz.js:534,569`). |
| 19:53:56 | `/verify 303 user_signedup` | Clicked the confirmation link. Email confirmed — `auth.users.email_confirmed_at` is set. |
| 19:53:58 | `/token 400: "both auth code and code verifier should be non-empty"` | **The callback bug, verbatim.** `/api/auth/callback` can't complete the PKCE exchange → bounced to `/login?error=auth`, which nothing renders. Silently signed out on a pristine login page. |
| 19:54–19:56 | 5× `Invalid login credentials`, 2× `/verify 403: Email link is invalid or has expired` | Tried passwords, re-clicked the used confirmation link. Locked out with no explanation and **no "forgot password" anywhere**. |
| 19:55:29, :32 | 2× `/signup 200 user_repeated_signup` | Tried to sign up again with the same email → Supabase anti-enumeration returns **fake success** (`identities: []`, never checked at `AuthForm.js:29-34`) → "Check your email!" → no email ever comes. |
| Jul 30 00:37–00:52 | 3× `Invalid login credentials`, 2× `user_repeated_signup` | She tried again tonight. Same walls. |

**Net state:** her account `33430bb8-5b71-4106-b717-27b93aed7c60` exists, email confirmed, `last_sign_in_at = NULL`, zero rows in `wine_profiles` / `dna_accumulation` / `wine_interactions`. The funnel converted a motivated user into a locked-out one at every single gate. Every defect below was confirmed against the extracted repo at commit `192f738`.

**Account rules for this initiative:** Ed's account (`c35e574d…`, CLAUDE.md line ~93) remains off-limits to automation. Account `33430bb8-5b71-4106-b717-27b93aed7c60` (`nicolanaartjie@hotmail.com`) is likewise **off-limits** — never sign in as it, modify it, or delete it. Use the dedicated e2e account or fresh `epgoodwin+e2e-*@gmail.com` addresses.

---

## 2. Confirmed defect register

Severity-ranked; all file:line refs verified by Cowork.

1. **CRITICAL — `/api/auth/callback` can never establish a session** (`src/app/api/auth/callback/route.js:10-16`). Plain `supabase-js` client: no cookie access → PKCE verifier unreadable → exchange always fails; and even on success no `Set-Cookie` is written to the redirect. Every email-confirmation click and every OAuth return dead-ends.
2. **CRITICAL — No password reset exists.** No link, no route, no `resetPasswordForEmail` anywhere in `src/`. Forgotten password = permanent lockout.
3. **CRITICAL — Google button rendered while provider disabled.** Confirmed live: `/authorize 400 provider is not enabled`.
4. **HIGH — `signUp` response never inspected** (`AuthForm.js:29-34`): (a) already-registered email → fake success, no email ("check your email" forever); (b) if confirmations were ever turned off, `data.session` is ignored and the user is told to check email while already signed in.
5. **HIGH — Anonymous quiz results irrecoverably lost at the signup seam** (`Quiz.js:529-535` bare `<a href="/signup">`; zero localStorage/sessionStorage in `src/`; `page.js:746` refuses anonymous saves). The reveal card literally promises "Save your profile free" — the funnel breaks that promise. CLAUDE.md already names this priority 1 (~line 118).
6. **MEDIUM — `?error=auth` emitted but never consumed** (`route.js:20`; login page reads no params). All callback failures are silent.
7. **MEDIUM — No try/finally in `handleSubmit`** (`AuthForm.js:18-37`): a thrown (non-AuthError) failure leaves the button on "..." forever.
8. **MEDIUM — Open redirect in callback** (`route.js:7,16`): unvalidated `next` → `${origin}${next}` allows `?next=@evil.com`. Becomes live the moment defect 1 is fixed.
9. **MEDIUM — Refresh-token rotation loss**: `palate-narrative/route.js:47` `setAll() {}` no-op discards rotated refresh tokens → random session death (a matching `Invalid Refresh Token: Refresh Token Not Found` appears in the logs, Jul 29 21:03). No `middleware.js` exists for server-side refresh.
10. **MEDIUM — Raw Supabase strings shown verbatim** (`AuthForm.js:26,33,44`) — violates CLAUDE.md voice rule (~line 72: warm, no raw errors, always say what to do next).
11. **LOW-MEDIUM — Inputs invisible to password managers**: no `name`/`id`/`label`/`autocomplete` attributes (`AuthForm.js:108-142`). `autoComplete="new-password"` at signup is the single biggest forgot-password preventer (iOS/1Password strong-password generation).
12. **LOW — assorted**: no password visibility toggle; `minLength={6}` browser-native tooltip only; "..." pending copy; Google button no pending/double-click guard; login always lands on `/` ignoring intended destination; error box not `role="alert"`; auth pages are a cul-de-sac (logo not a link); `<a>` instead of `next/link`; no auth e2e coverage of signup at all (`e2e/auth.setup.ts` is login-only infrastructure).

Security findings adjacent to auth (for Session 4): `/api/fetch-menu` SSRF (fetches arbitrary URLs, follows redirects, no rate limit — `fetch-menu/route.js:122-153`); paid Claude routes unauthenticated with per-instance in-memory rate limiter; `keepalive` route imports the browser client factory; env-missing stub client bakes a dead build silently.

---

## 3. Ed's decisions (recorded July 30)

- Password reset via email: **must-have**.
- **Google sign-in: yes.** **Magic link: yes.** Apple: no (for now).
- **Anonymous teaser flow folded into this scope** (quiz → partial reveal → signup without losing results) — one coherent overhaul of the entry funnel.

---

## 4. The plan — four Claude Code sessions

Same rules as Palate Act II: each session ends with clean build, full unit + e2e suites green, a session readout, and Cowork independently verifies against prod DB/logs before the next session starts. Brand voice per CLAUDE.md throughout: warm, sommelier-flavored, no raw error strings, always a next step. The Reveal's theater is untouchable.

### Session 1 — "The Front Door" (auth core: nothing else matters until this works)

1. **Rebuild the confirmation/callback layer on `@supabase/ssr`:**
   - New `GET /api/auth/confirm`: handles email links via `token_hash` + `supabase.auth.verifyOtp({ type, token_hash })` using `createServerClient` with a cookie-**writing** adapter bound to the redirect response (the read-only pattern in `palate-narrative/route.js:39-51` is the reference, but `setAll` must actually set). Handles `type=signup|recovery|magiclink|email_change`. Requires the matching email-template change in the dashboard (see §5) — ship both together.
   - Rewrite `GET /api/auth/callback` (OAuth PKCE exchange) the same way.
   - **Validate `next`**: must start with a single `/`, reject `//`, `/\`, and anything containing `\` or `:`; else fall back to `/`. Kills the open redirect.
   - On failure, redirect to `/login?error=<reason>&email=<email-if-known>` with distinct reasons (`link_expired`, `exchange_failed`) — never a silent bounce.
2. **Add `middleware.js`** with the standard `@supabase/ssr` session-refresh pattern (matcher excluding static assets); fix the `setAll` no-op in `palate-narrative` to write refreshed cookies. This kills the random-logout class.
3. **Make `AuthForm` truthful and resilient:**
   - Wrap submit in try/catch/finally — `loading` always clears; network failure gets brand copy ("We couldn't reach our cellar just now — check your connection and try again.").
   - Inspect the `signUp` result: `data.user?.identities?.length === 0` → dedicated "you already have an account" state: *"Good news — you already have an account with us. Sign in instead, or reset your password if it's slipped your mind."* (both as links, email carried over). `data.session` present → straight in (`router.push`), no email theater.
   - Success → swap the form for a dedicated check-your-inbox state showing the address, a spam note, and a **Resend** button gated by a 60-second countdown (Supabase resend rate limit surfaces as brand copy, not the raw "For security purposes…" string).
   - Read `?error` + `?email` search params on the login page and render mapped brand copy (this is where confirm/callback failures land).
   - Central error map (extract to `src/lib/authCopy.js` for unit testing): wrong-credentials, unconfirmed-email (with resend affordance), rate-limit, network, link-expired, exchange-failed.
4. **Full password-reset flow:**
   - "Forgot your password?" link under the password field on login.
   - `/forgot-password`: email capture → `resetPasswordForEmail(email, { redirectTo: <confirm route> → next=/update-password })`. Anti-enumeration copy: *"If that email has an account with us, a reset link is on its way. Check your inbox."*
   - `/update-password`: requires the recovery session; new password (+ visibility toggle from day one here), `updateUser({ password })`, then land signed-in on `/` with a quiet confirmation.
5. **Google button honesty:** render it only when `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1`. Flag stays off until the provider is configured (§5); add pending/disabled state for when it goes live.
6. **Tests (CLAUDE.md rule: at least one spec hard-fails when the happy path breaks):**
   - Unit: error map; already-registered branch; `next` validation table (including `@evil.com`, `//evil.com`, `/\evil.com`).
   - Route tests for `/api/auth/confirm` + `/api/auth/callback` with mocked `verifyOtp`/`exchangeCodeForSession` asserting cookies are set on the response.
   - e2e via **Playwright route interception of `/auth/v1/*`** (no junk users, deterministic): signup happy path UI, fake-success/already-registered branch, wrong-password copy, expired-link landing, reset request → update-password. Real-signup canary stays a manual pre-launch step (Cowork runs it in §6).

### Session 2 — "Never Lose a Palate" (the seam + teaser)

1. **Persist the anonymous quiz:** at reveal time, stash `{ answers, profile, createdAt, version }` in `localStorage` (`sommeasy.pendingPalate`). Survives the email-confirmation round trip in the same browser (sessionStorage wouldn't survive a new tab from the email client — localStorage, with a 7-day expiry and version gate).
2. **Save-on-first-auth:** on authenticated load of `/`, if no `wine_profiles` row exists and a valid stash does → run the existing `handleSaveProfile` path (`page.js:745-792`, merge-don't-clobber semantics unchanged) → clear the stash → land on the reveal/palate with a welcome-back moment: *"Welcome back. Your palate was waiting."* If a profile already exists (returning user who retook the quiz signed-out), merge via the existing quiz-promotion reconciliation, never clobber.
3. **Anonymous teaser reveal** (the parked Act II initiative, now in scope): anonymous users get the archetype hero + a partial read (e.g., top signature + a taste of the recs); full DNA, evolution, and ratings sit behind *"Create your account to meet your full palate."* Gate depth, not delight — the staged reveal animation stays. Honest CTA copy everywhere: the card may only promise saving because Session 2 makes it true.
4. **"Already have an account?" on the reveal card** — *"Sign in — we'll fold this into your palate."* (the exact path the real user needed).
5. **Destination preservation:** signed-out gates on `/palate`, `/journal`, `/recommend` pass `?next=`; login, signup, OAuth `redirectTo`, and the confirm route all honor it (validated per Session 1 rules).
6. **Tests:** e2e anonymous quiz → stash → login (seeded account via route interception or the e2e account) → auto-save → reveal; stash expiry/version; merge-not-clobber regression (existing suites 9H/9I stay green).

### Session 3 — "Polish the Brass" (best-in-class furniture + magic link)

1. Form fundamentals: visible labels (brand-styled), `name`/`id`, `autoComplete="email"` / `"current-password"` / `"new-password"`, `autoFocus` on email, `inputMode`, password visibility toggle, requirements helper (*"At least 8 characters."* — raise client `minLength` to 8 in step with the dashboard policy change in §5).
2. States: pending copy ("Signing you in…" / "Creating your account…" / "Opening Google…"), all buttons disable while pending, `role="alert"` + `aria-live="polite"` on error/message boxes, focus moved to the error on failure.
3. Navigation: logo links home on auth pages; all funnel cross-links become `next/link`; signup page gets its own metadata.
4. Copy pass over every auth state in the Somm's voice (use the error map from Session 1 as the single source).
5. **Magic link** (Ed's pick): on login, *"Email me a sign-in link instead"* → `signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: <confirm route> } })` → same check-your-inbox state with gated resend. Requires custom SMTP live (§5) — if SMTP isn't configured yet, ship dark behind `NEXT_PUBLIC_MAGIC_LINK_ENABLED`.
6. Anonymous recs copy variant on the reveal (read-only cards shouldn't say "rate the ones you know").
7. Tests: a11y assertions (labels/roles/autocomplete present), pending-state specs, magic-link UI branch via route interception.

### Session 4 — "Hardening & Watchtower"

1. **`/api/fetch-menu` SSRF fix:** resolve + block private/link-local/localhost ranges, cap redirects with re-validation per hop, add `checkRateLimit`.
2. Rate limiting: add limiter to auth-adjacent API routes; document the per-instance limiation; decide (with Ed) whether Turnstile captcha ships now or post-launch — code path prepared behind a flag.
3. `keepalive` route: proper server client; stub client (`supabase.js:8-23`) either covers the full query-builder chain or fails the build loudly when env vars are missing (prefer a build-time assertion).
4. Negative-path e2e sweep + the full-suite regression run (all existing 32 specs green on the e2e account).
5. **Observability:** structured logs on every confirm/callback failure (`[auth] confirm failed: <reason>`), counted via Vercel logs; add auth-funnel entries to the weekly health-check ritual (signups started vs sessions established vs `link_expired` landings; `mail.send` volume vs SMTP quota).
6. Housekeeping carried over: `.DS_Store` → `.gitignore`; decide fate of `scripts/build_wine_reference.py`; stray `{src` directory in the repo root.

---

## 5. Dashboard checklist (outside the repo — Ed + Cowork, ~30–45 min, coordinated with Session 1)

Nothing auth-related lives in the repo (no `config.toml`, no templates). For project `zugunlctgpytgyxftllv`:

| # | Setting | Target |
|---|---|---|
| 1 | Auth → URL Configuration → Site URL | `https://sommeasy.wine` |
| 2 | Redirect URLs allowlist | `https://sommeasy.wine/api/auth/confirm`, `.../api/auth/callback`, `www.` variants if the domain resolves, `http://localhost:3000/api/auth/*`, Vercel-preview wildcard if previews are used |
| 3 | **Custom SMTP** (launch blocker — built-in service is ~2-4 emails/hr project-wide; `mail.send` events confirm it's in use today) | Resend (or Postmark) with SPF/DKIM on `sommeasy.wine`; sender e.g. `The Somm <somm@sommeasy.wine>`; then raise Auth → Rate Limits email cap |
| 4 | Email templates | Rewrite confirm/recovery/magic-link to the `token_hash` pattern (`{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=...&next=...`). Session 1 ships ready-to-paste branded HTML in `docs/email-templates/`. **Must flip together with the Session 1 deploy.** |
| 5 | Google provider | Enable; Google Cloud OAuth client with authorized redirect URI `https://zugunlctgpytgyxftllv.supabase.co/auth/v1/callback`, origins `https://sommeasy.wine`. Then set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1` in Vercel. |
| 6 | Password policy | Minimum 8 (raise with the client change in Session 3); enable leaked-password protection if plan allows |
| 7 | Attack protection | Captcha decision deferred to Session 4; revisit once SMTP + launch traffic exist |

---

## 6. Verification (Cowork, after each session — non-negotiable)

- **S1:** fresh `epgoodwin+e2e-signup-<date>@gmail.com` prod signup → confirmation email → click → lands **signed in** (auth logs: `user_signedup` then token grant 200, no `code verifier` error; `auth.users.last_sign_in_at` set). Full reset round-trip on the e2e account. Open-redirect probes bounce to `/`. `?error` landings render copy (screenshot).
- **S2:** anonymous quiz on prod → signup → confirm → `wine_profiles` + founding `dna_accumulation` rows match the stash (SQL diff); welcome-back moment fires; existing-account merge leaves prior DNA intact.
- **S3:** password-manager autofill exercises correctly (manual check on Ed's devices); a11y attribute grep; copy review against CLAUDE.md voice.
- **S4:** SSRF probes to `169.254.169.254` / `localhost` rejected; rate-limit returns 429 with brand copy; log lines present in Vercel for a forced failure.
- **Wife's account:** after S1 ships, she resets her password via the real flow (or uses the temp password if Ed opts for the immediate unblock) — after S2, she retakes the quiz and her palate saves. That is the acceptance test for this whole initiative.

## 7. Out of scope (parked, unchanged)

"Want to try" on Somm picks; journal deep redesign; durable (Redis) rate limiting; weekly scheduled health-check task; Apple sign-in.
