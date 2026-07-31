# Auth & Palate Watchtower — weekly health-check ritual

A 5-minute weekly pass over the Vercel logs for project `sommeasy` (and the
Supabase auth logs for `zugunlctgpytgyxftllv`). The point: catch a broken
funnel the way the July 29 forensics caught the callback bug — from the log
lines, before a user reports it. Every load-bearing path emits a structured,
greppable line with a reason code.

**Retention caveat (measured July 31, 2026):** the Hobby plan keeps runtime
logs for ~1 hour, so "last 7 days" greps only work from the Logs tab's live
window or after an Observability upgrade. Until traffic and plan justify
that, treat each weekly pass as a sample, not a census — and treat ANY
escalation signature seen in a sample as if it were sustained.

## What to grep, what healthy looks like, when to escalate

Run these over the last 7 days of Vercel logs (Logs tab → filter, or
`vercel logs <deployment> | grep …`).

### 1. Signup funnel: started vs established

| Grep | Meaning |
|---|---|
| `mail.send` (Supabase auth logs) | confirmation/magic emails actually sent |
| `[auth] confirm ok` | a session was established from an email link (token_hash or transitional code) |
| `[auth] callback ok: via=pkce` | a session was established from OAuth / a same-browser PKCE link |
| `[auth] confirm failed: <reason>` | an email link dead-ended (`link_expired`, `exchange_failed`) |
| `[auth] callback failed: <reason>` | an OAuth/PKCE return dead-ended |

- **Healthy:** `confirm ok` + `callback ok` should track close to `mail.send`
  volume (minus the expected tail of users who never click). A steady trickle
  of `link_expired` is normal (people click old links); it should be a
  minority.
- **Escalate when:** `confirm failed` **exceeds** `confirm ok` over the week,
  or `confirm ok` drops to ~0 while `mail.send` is healthy — that's the
  callback-bug signature (links arrive, sessions never establish). This is the
  exact failure that motivated the whole overhaul; treat a spike as a launch
  blocker.

### 2. Link-expiry pressure

- Grep `[auth] confirm failed: link_expired` and `error=link_expired` landings.
- **Healthy:** a low, flat rate.
- **Escalate when:** it climbs sharply — usually means SMTP latency (emails
  arriving after the token TTL) or a template pointing at the wrong
  `type`/route. Cross-check `mail.send` timing and the dashboard email
  templates.

### 3. SSRF probes (fetch-menu)

- Grep `[fetch-menu] blocked: <reason>` (`blocked_host`, `bad_protocol`,
  `dns_failed`, `too_many_redirects`).
- **Healthy:** rare, and almost always `dns_failed` / user typos.
- **Escalate when:** a burst of `blocked_host` — someone is probing internal
  ranges (169.254.x, 127.x, 10.x). The guard is doing its job; note the source
  and consider tightening rate limits / enabling Turnstile
  (`NEXT_PUBLIC_CAPTCHA_ENABLED`).

### 4. Somm validation failures (carried over from the July 29 fix)

- Grep `[somm-picks] validation failed` and `[palate-narrative] validation failed`.
- **Healthy:** occasional single lines (one bad model response, recovered by
  retry or silent fallback). The `retry recovered` / `salvaged` lines nearby
  mean the self-healing worked.
- **Escalate when:** sustained `validation failed` with no `retry recovered` —
  the model or prompt contract drifted; the UI is silently serving algorithmic
  picks only. This is the class of dead-integration that outcome-tolerant tests
  once masked for weeks.

### 5. Rate limiting

- Grep `429` responses on `/api/parse-wine-list`, `/api/scan-label`,
  `/api/somm-picks`, `/api/fetch-menu`.
- **Healthy:** near-zero.
- **Escalate when:** a single IP is generating many — abuse, or the
  per-instance limiter (see `src/lib/rateLimit.js`) is being outrun across warm
  instances. That's the signal to ship the durable Redis/KV limiter.

### 6. Cost

- Grep `"type":"claude_usage"` — one JSON line per Claude call with
  `estCostUSD`.
- **Healthy:** in line with the CLAUDE.md per-call measurements (scan ~$0.009,
  somm $0.021–0.025, narrative ~$0.006).
- **Escalate when:** per-call cost or call volume jumps unexpectedly — a
  retry storm, a prompt regression inflating tokens, or abuse.

### 7. Session death (refresh-token rotation)

- Grep `Invalid Refresh Token` (Supabase auth logs).
- **Healthy:** near-zero after the S1 middleware + `palate-narrative` setAll
  fix.
- **Escalate when:** it reappears — a route is discarding rotated cookies
  again (a `setAll` no-op crept back). Check any new server client for a
  cookie-writing adapter.

## The Palate (Act III) — identity health

### 8. Identity shifts (`dna_timeline` + the milestone hook)

- SQL, not grep (the hook writes rows, not log lines):
  `SELECT count(*), date_trunc('day', event_at) FROM dna_timeline WHERE event_type='shifted' GROUP BY 2;`
- **Healthy:** shifts track rating activity — a new engaged user typically
  earns their first inside 2–5 bottles (the S3 milestone economics). Zero
  shifts amid healthy rating volume for weeks means milestones stopped firing.
- **Escalate when:** shifts outpace rated bottles (a recompose loop — two
  tabs should CAS to ONE event; more means the guard broke), or any
  `shifted` row appears with no matching rating activity (a migration or
  quiz save wrote a celebration — both are forbidden by construction; the
  quiz-completion e2e guard pins it).

### 9. The Somm's corrective retry (`somm-picks`)

- Grep `[somm-picks] retrying after: <reason>` vs total `POST /api/somm-picks 200`.
- **Baseline (July 31, 2026):** the "fires on every attempt" impression from
  local dev did NOT hold up — the live sample that day was a clean
  first-attempt success (16.1s, no retry line); the interlude's documented
  44.9s case was a retry that *recovered by design*. Prod rate was
  unmeasurable (1h retention, pre-launch traffic ≈ 0) — this grep is how the
  real rate accumulates once traffic exists.
- **Healthy:** retries a minority of calls, each near a `retry recovered`.
- **Escalate when:** `retrying after:` on most calls (the prompt contract is
  drifting — collect the logged reasons first; a fix should target the
  dominant reason, not guess), or `validation failed` lines with no
  recovery (see §4).

### 10. Palate-narrative regeneration rate + cost

- Grep `claude_usage` lines with `"route":"palate-narrative"`, and
  `[palate-narrative]` failures.
- **Healthy:** regenerations only after real palate movement (a `shifted`/
  `promoted` event or ≥5 new rated bottles re-arms the staleness gate), at
  ~$0.006 each. A user's narrative regenerating on every /palate visit means
  the gate broke — check `narrative_updated_at` is being stamped.
- **Escalate when:** volume decouples from timeline events (gate broken →
  silent cost leak), or failures with no fallback line (the route must keep
  the existing narrative on ANY failure).

## Reason-code reference

Auth funnel lines share the `[auth]` prefix and a `<phase> <ok|failed>: <detail>` shape:

- `[auth] confirm ok: via=token_hash type=<t>` / `via=code`
- `[auth] callback ok: via=pkce`
- `[auth] confirm failed: <reason>` — reasons: `verifyOtp`, `code exchange`, `bad params`
- `[auth] callback failed: <reason>` — reasons: `exchange`, `provider`, `no code param`
- lands map to `/login?error=link_expired|exchange_failed` (what the user sees)

Other prefixes: `[fetch-menu] blocked: <reason>`, `[somm-picks] …`,
`[palate-narrative] …`, `[keepalive] …`, `[captcha] …`.

## Ownership

This ritual is Cowork's until launch traffic justifies a scheduled job
(parked in "Out of scope" — a weekly cron that greps and posts a summary).
Until then it's a manual Monday pass; the escalation signals above are the
only things that need a human decision.
