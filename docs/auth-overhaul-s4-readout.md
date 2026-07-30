# Session 4 Readout — "Hardening & Watchtower" (closes the initiative)

**Executed by Claude Code, July 31, 2026, against `docs/auth-overhaul-brief.md` §4 Session 4.**
For Cowork's independent post-review. Base: `main` @ `a5751b6` (S3 verified). This is the final session.

## Verification summary

| Check | Result |
|---|---|
| `npm run build` (env present) | ✅ clean, 17/17 static pages, fetch-menu + keepalive dynamic |
| **`npm run build` (env ABSENT)** | ✅ **fails loudly** — `/`, `/journal`, `/palate` prerender throw "Supabase env vars missing… Refusing to build a client with dead auth" (the item-3 promise, verified) |
| Unit suites (8) | ✅ 239/239 — +48 ssrfGuard, +8 captcha; authFlow 56 (6→8 fixture fixed); all prior green |
| `npm run test:e2e` | ✅ 57/57 (52 + 5 negative-path; seeder skipped) |
| Live SSRF probes (dev) | ✅ 169.254.169.254, localhost:3000, `[::ffff:127.0.0.1]`, 10.0.0.1 → all 422 + brand copy |
| Account rules | ✅ no real users (route interception); Ed's + `33430bb8…` untouched |

## What shipped (scope item → implementation)

### 1. `/api/fetch-menu` SSRF fix
- **`src/lib/ssrfGuard.js` (new, dependency-free core):**
  - [`isBlockedIp`](src/lib/ssrfGuard.js) — classifies IPv4 + IPv6, **fails closed** on unparseable input. Blocks this-host/private/CGNAT/loopback/link-local (incl. 169.254.169.254)/IETF/benchmarking/multicast/reserved for v4; unspecified/loopback/ULA/link-local/multicast/documentation/discard for v6; and **IPv4-mapped forms** (`::ffff:169.254.169.254`) by judging the embedded v4.
  - [`assertPublicUrl`](src/lib/ssrfGuard.js:167) — http(s)-only, resolves DNS (injectable `lookup` for tests), rejects if **any** resolved address is blocked. Numeric/octal/hex IPv4 bypasses (`http://2130706433`) are caught because getaddrinfo normalizes them into the same validation (verified live).
  - [`safeFetch`](src/lib/ssrfGuard.js:210) — `redirect: "manual"` + re-validates every hop before connecting, with a hop cap. A public URL that 302s to metadata is stopped at the hop (unit-tested).
- **Route wiring** ([fetch-menu/route.js:129,157,176](src/app/api/fetch-menu/route.js)): `checkRateLimit("fetch-menu")` before any fetch (429 + brand copy); `safeFetch` replaces the raw `fetch(redirect:"follow")`; `SsrfError` → 422 + `SSRF_BLOCK_MESSAGE` + `[fetch-menu] blocked: <reason>` log that never leaks the probed host.

### 2. Rate limiting on auth-adjacent surface + captcha path
- **Interpretation:** the pure-auth calls (signup/token/otp) hit *Supabase's* rate-limited endpoints (now 30/hr email), not ours — there's nothing of ours to limit there, and confirm/callback are one-shot link clicks that must NOT be throttled. So "auth-adjacent API surface" = our network/paid routes: the Claude routes already had the limiter; **fetch-menu now does too** (item 1). Documented in the readout so the scope call is explicit.
- **`src/lib/rateLimit.js`**: header comment now documents the per-instance limitation (limit × warm instances; cold start resets) and the Redis/KV upgrade path behind the same `checkRateLimit` signature.
- **`src/lib/captcha.js` (new, dark):** `NEXT_PUBLIC_CAPTCHA_ENABLED` default off → `verifyCaptchaToken` is a pass-through no-op, so nothing breaks with the flag absent. When enabled: Turnstile siteverify with `TURNSTILE_SECRET_KEY`; **fails open** (logged) on missing secret or a Cloudflare outage — the "never wall off signups" bias. Enable decision deferred to post-launch with Ed.

### 3. keepalive + stub client
- **[keepalive/route.js](src/app/api/keepalive/route.js):** now `createServerClient` (no-op cookie adapter — no session needed) instead of the browser factory.
- **[supabase.js:13,26](src/lib/supabase.js):** `createClient` **throws** when `NEXT_PUBLIC_SUPABASE_*` are missing, replacing the silent stub. The static `/` prerender calls it during build, so a misconfigured deploy fails the build instead of shipping dead auth. **Verified** by building with the vars unset.

### 4. Negative-path e2e sweep
- New "Auth — negative paths (Session 4)" block + one update-password case: network-failure copy on **all three forms** (login/forgot/update, via `route.abort`), rate-limit 429 → "easy does it" (raw "For security purposes" asserted absent), and the distinct expired-link/exchange-failed landings. SSRF rejection is covered at the unit level (the resolver) + the live dev probe.

### 5. Observability ("Watchtower")
- **Success log lines added** ([confirm:41,60](src/app/api/auth/confirm/route.js), [callback:49](src/app/api/auth/callback/route.js)): `[auth] confirm ok: via=token_hash type=<t>` / `via=code`, `[auth] callback ok: via=pkce` — the funnel **numerator** the brief wanted (sessions established), to sit against the existing `[auth] … failed: <reason>` lines and Supabase `mail.send`.
- **`docs/auth-watchtower.md` (new):** the weekly ritual — what to grep (funnel started vs established, link_expired pressure, `[fetch-menu] blocked` bursts, `[somm-picks] validation failed` carried over from the July 29 fix, 429s, `claude_usage` cost, refresh-token death), what healthy looks like, and the escalation signal for each. The callback-bug signature (`confirm ok` → 0 while `mail.send` healthy) is called out as a launch blocker.

### 6. Housekeeping
- Removed the stray `{src` directory (an unexpanded brace-`mkdir` — all-empty literal dirs).
- `scripts/build_wine_reference.py` **does not exist** (already gone); the tracked scripts are `build_quiz_data.py`, `backfill-rec-rating-dna.mjs`, `esm-compat-loader.mjs` — all live, kept.
- `.DS_Store` already gitignored + untracked (no change needed).
- Fixed the stale 6-char fixture in `authFlow.test.js` (the mapping test fed "at least 6 characters"; now 8, matching the live policy). No dead auth exports found — every AuthShell export is consumed (some now only internally by `AuthField`, kept as shell vocabulary).

## Standing pattern rules — preserved (re-verified)
- `searchParams` still a server prop on all auth pages (no `useSearchParams` in auth components).
- Submit controls still hydration-gated. No regressions.

## Deviations / judgment calls (for review)
1. **Rate-limiting scope** (§2): auth routes themselves are deliberately NOT rate-limited (Supabase owns that; confirm/callback are one-shot). fetch-menu + Claude routes are the surface we control. Flagging in case the brief intended our own limiter on confirm/callback.
2. **fail-the-build over cover-the-stub** (§3): took the brief's stated preference. The tradeoff: a genuinely env-less build (e.g. a misconfigured preview) now fails — which is the point (no dead-auth deploys), but worth Ed knowing the build depends on the vars being set.
3. **captcha fails open** on misconfig/outage — consistent with the whole overhaul's "never break the funnel" bias, but it means an enabled-but-broken captcha lets traffic through rather than blocking. Documented in the file.
4. **SSRF is defense-in-depth, not absolute:** resolve-then-validate has a theoretical DNS-rebinding TOCTOU window; per-hop revalidation + hop cap + getaddrinfo normalization shrink it. A pinned-IP connect (validate then connect to the exact IP) is the belt-further-tightening if we ever need it; noted in the module header.
5. Live SSRF probes were run against the **dev** server (localhost) — production probes to `169.254.169.254` are Cowork's §6 S4 check.

## What Ed/Cowork should verify (§6 S4)
- Prod SSRF probes to `169.254.169.254` / `localhost` rejected with brand copy.
- fetch-menu 429 after 10 URL fetches from one IP within the hour.
- A forced auth failure shows the `[auth] … failed` line in Vercel logs; a real confirm shows `[auth] confirm ok`.
- One pass of the `docs/auth-watchtower.md` ritual to seed the baselines.

## Initiative close
All four sessions shipped (S1 `d92214d`, S2 `227d042`, S3 `a5751b6`, S4 this commit). The door is rebuilt, the seam holds, the furniture is best-in-class, and the watchtower is manned. Remaining items are dashboard/ops (SMTP is live; Google provider + `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`, magic-link flag flip, captcha enable decision) and the parked durable-rate-limit upgrade — all tracked in CLAUDE.md priorities.
