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
  `estCostUSD`. Since The Long Memory, the somm and narrative calls ALSO
  write durable `wine_events` cost records (`somm_curation`,
  `narrative_regenerated`), so the 1-hour retention no longer erases the
  ledger — SQL:

  ```sql
  SELECT event_type, count(*) AS calls,
         round(sum((payload->>'est_cost_usd')::numeric), 4) AS usd
  FROM wine_events
  WHERE event_type IN ('somm_curation', 'narrative_regenerated')
    AND occurred_at > now() - interval '30 days'
  GROUP BY 1;
  ```

- **Healthy:** in line with the CLAUDE.md per-call measurements (scan ~$0.009,
  somm $0.021–0.025, narrative ~$0.006).
- **Escalate when:** per-call cost or call volume jumps unexpectedly — a
  retry storm, a prompt regression inflating tokens, or abuse. (Scan/label
  calls stay grep-only — their durable trace is `menu_analyzed`, which
  records the analysis, not its cost.)

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
- **Durable since The Long Memory** — the weekly ritual gets SQL instead of
  a hopeful grep (`menu_analyzed` records every analysis with its somm
  outcome; `superseded` means the user refiltered before The Somm answered):

  ```sql
  SELECT payload->'somm'->>'outcome' AS outcome, count(*)
  FROM wine_events
  WHERE event_type = 'menu_analyzed'
    AND occurred_at > now() - interval '7 days'
  GROUP BY 1 ORDER BY 2 DESC;
  ```
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

## The launch funnel (The Long Memory — wine_events + Web Analytics)

Anonymous traffic is aggregate only: Vercel Web Analytics (cookieless
pageviews) covers landing → quiz start → teaser views from the Vercel
dashboard. Identified behavior starts at signup and lives in `wine_events`.
There is deliberately NO anonymous identity stitching — the pending-palate
back-log (`quiz_completed` with mode `restore`, `occurred_at` = when the
anonymous quiz actually happened) covers the one moment that matters in
between.

The three queries that matter for launch week:

### 11a. Quiz completions vs signups (conversion through the teaser gate)

```sql
SELECT
  (SELECT count(*) FROM auth.users
    WHERE created_at > now() - interval '7 days')                    AS signups,
  (SELECT count(DISTINCT user_id) FROM wine_events
    WHERE event_type = 'quiz_completed'
      AND occurred_at > now() - interval '7 days')                   AS users_completing_quiz,
  (SELECT count(*) FROM wine_events
    WHERE event_type = 'quiz_completed' AND payload->>'mode' = 'restore'
      AND occurred_at > now() - interval '7 days')                   AS anonymous_quizzes_folded_in;
```

Read `anonymous_quizzes_folded_in` against the teaser pageviews in Web
Analytics: that ratio IS the teaser gate's conversion. **Escalate when**
teaser views are healthy but fold-ins are ~0 — the stash/metadata carry
broke (the palate-handoff guards pin it, but prod SMTP/browser weirdness is
exactly what the July 30 canary caught).

### 11b. Signups vs first rating

```sql
WITH ratings AS (
  SELECT user_id, min(occurred_at) AS first_rating_at
  FROM wine_events
  WHERE event_type IN ('pick_rated', 'rec_rated', 'bottle_logged', 'journal_rerated')
  GROUP BY user_id
)
SELECT count(u.id)                                   AS signups,
       count(r.user_id)                              AS rated_at_least_once,
       round(100.0 * count(r.user_id) / greatest(count(u.id), 1)) AS pct
FROM auth.users u
LEFT JOIN ratings r ON r.user_id = u.id
WHERE u.created_at > now() - interval '7 days';
```

**Escalate when** pct stalls near zero — users meet their palate and never
feed it; the reveal's ratable recs or the /recommend flow isn't landing.

### 11c. First rating vs first shift

```sql
WITH first_rating AS (
  SELECT user_id, min(occurred_at) AS at FROM wine_events
  WHERE event_type IN ('pick_rated', 'rec_rated', 'bottle_logged', 'journal_rerated')
  GROUP BY user_id
),
first_shift AS (
  SELECT user_id, min(event_at) AS at FROM dna_timeline
  WHERE event_type = 'shifted' GROUP BY user_id
)
SELECT count(fr.user_id) AS users_with_a_rating,
       count(fs.user_id) AS users_with_a_shift,
       round(avg(EXTRACT(epoch FROM fs.at - fr.at) / 3600)::numeric, 1) AS avg_hours_rating_to_shift
FROM first_rating fr
LEFT JOIN first_shift fs ON fs.user_id = fr.user_id;
```

The identity split in one query: ratings are usage (`wine_events`), shifts
are identity (`dna_timeline`) — never duplicated. **Escalate when** rating
volume is healthy but shifts stay zero for weeks (milestones stopped
firing — cross-check §8).

### 11d. Steer adoption ("A Word with the Somm", Aug 2026)

Every `menu_analyzed` payload carries `steer` — the diner's free-text
direction verbatim, or null when the box was left empty:

```sql
SELECT count(*)                                        AS analyses,
       count(*) FILTER (WHERE payload->>'steer' IS NOT NULL) AS steered,
       round(100.0 * count(*) FILTER (WHERE payload->>'steer' IS NOT NULL)
             / greatest(count(*), 1))                  AS pct_steered
FROM wine_events
WHERE event_type = 'menu_analyzed'
  AND occurred_at > now() - interval '7 days';

-- What people actually type (the product signal — grape? place? food?):
SELECT payload->>'steer' AS steer, count(*)
FROM wine_events
WHERE event_type = 'menu_analyzed' AND payload->>'steer' IS NOT NULL
  AND occurred_at > now() - interval '7 days'
GROUP BY 1 ORDER BY 2 DESC LIMIT 20;
```

This feature came from real-user feedback (she wanted to steer, not name an
occasion) — the second query is the check that the reframe landed. **Watch
for** steers the Somm can't honor at the candidate layer (styles like "big
reds" rely on the model; grapes/places also get slate augmentation). No
escalation threshold — this one is a product dial, not an alarm.

### 11e. The table verdict (somm conversion funnel — "The Table Verdict", Aug 2026)

Also from real-user feedback: "need to be able to log if you selected one
of the recommended wines... as well as 'went with a different option'."
Every /recommend analysis carries a client-minted `session` id on its
`menu_analyzed` payload, and `pick_chosen` / `somm_bypassed` / `pick_rated`
carry the same id — so a curation session resolves to chosen(+rated),
chosen(unrated), bypassed, or silent, and this query IS the Somm's hit
rate:

```sql
WITH sessions AS (
  SELECT DISTINCT user_id, payload->>'session' AS session
  FROM wine_events
  WHERE event_type = 'menu_analyzed'
    AND payload->>'session' IS NOT NULL
    AND occurred_at > now() - interval '7 days'
),
chosen AS (
  -- Latest declaration per session wins (the table changes its mind;
  -- pick_chosen is append-only and carries `replaced` for the history)
  SELECT DISTINCT ON (user_id, payload->>'session')
         user_id, payload->>'session' AS session,
         payload->>'wine' AS wine, occurred_at
  FROM wine_events
  WHERE event_type = 'pick_chosen'
    AND occurred_at > now() - interval '7 days'
  ORDER BY user_id, payload->>'session', occurred_at DESC
),
rated AS (
  SELECT DISTINCT c.user_id, c.session
  FROM chosen c
  JOIN wine_events r
    ON r.user_id = c.user_id
   AND r.event_type IN ('pick_rated', 'rec_rated', 'journal_rerated', 'bottle_logged')
   AND lower(trim(r.payload->>'wine')) = lower(trim(c.wine))
   AND r.occurred_at >= c.occurred_at
),
bypassed AS (
  SELECT DISTINCT user_id, payload->>'session' AS session
  FROM wine_events
  WHERE event_type = 'somm_bypassed'
    AND occurred_at > now() - interval '7 days'
)
SELECT
  (SELECT count(*) FROM sessions)  AS curation_sessions,
  (SELECT count(*) FROM chosen)    AS chose_a_pick,
  (SELECT count(*) FROM rated)     AS chosen_and_rated,
  (SELECT count(*) FROM bypassed)  AS went_a_different_way;
```

Read it as a funnel: `chose_a_pick / curation_sessions` is how often the
Somm's picks make it onto the table (with `went_a_different_way` as the
honest denominator's other half — silence is the remainder, and silence is
no longer ambiguous). `chosen_and_rated / chose_a_pick` is the follow-
through — that conversion is the home "how was it?" prompt's one job.
**Escalate when** chosen stays healthy but chosen_and_rated sits near zero
for weeks (the ask isn't landing — check the 14-day expiry and the
verdict-ask query in src/app/page.js), or when bypasses dominate chosen
(the Somm is losing the table — read the steers in §11d next).

### 11f. The first pour (quiz → first action — "The First Pour", Aug 2026)

The Aug 3 health report's teeth: 3 of 5 new signups stalled at
quiz-with-zero-bottles. Home's First Pour cards exist to move exactly this
number, and this query is how the next health report judges them — per
user: when did the quiz land, and how long until the first real action
(a logged bottle or an analyzed menu)?

```sql
WITH first_quiz AS (
  SELECT user_id, min(occurred_at) AS quiz_at
  FROM wine_events
  WHERE event_type = 'quiz_completed'
  GROUP BY user_id
),
first_action AS (
  SELECT user_id,
         min(occurred_at) FILTER (WHERE event_type = 'bottle_logged')  AS first_bottle,
         min(occurred_at) FILTER (WHERE event_type = 'menu_analyzed')  AS first_menu
  FROM wine_events
  GROUP BY user_id
)
SELECT
  q.user_id,
  q.quiz_at::date                                   AS quiz_day,
  a.first_bottle,
  a.first_menu,
  least(a.first_bottle, a.first_menu) - q.quiz_at   AS lag_to_first_action
FROM first_quiz q
LEFT JOIN first_action a USING (user_id)
ORDER BY q.quiz_at DESC;
```

And the one-line conversion summary:

```sql
WITH first_quiz AS (
  SELECT user_id, min(occurred_at) AS quiz_at
  FROM wine_events WHERE event_type = 'quiz_completed' GROUP BY user_id
),
acted AS (
  SELECT DISTINCT user_id FROM wine_events
  WHERE event_type IN ('bottle_logged', 'menu_analyzed')
)
SELECT
  count(*)                                        AS quiz_users,
  count(*) FILTER (WHERE a.user_id IS NOT NULL)   AS reached_first_action,
  round(100.0 * count(*) FILTER (WHERE a.user_id IS NOT NULL) / greatest(count(*), 1)) AS pct
FROM first_quiz q LEFT JOIN acted a USING (user_id);
```

Baseline at ship time (Aug 3): 2 of 5 — the report's 3-of-5 stall. **Escalate
when** the pct hasn't moved by the Aug 10 health report (the cards aren't
teaching — check card impressions are even possible: verdict-ask precedence,
the two head queries in src/app/page.js, and whether new users' home visits
happen at all), or when lag_to_first_action stretches past a week for users
who DO convert (the cards teach, but not soon enough — reconsider order or
copy). Note: rate-one retirements deliberately leave no event trace
(interactions-only by design) — this funnel watches the two event-bearing
verbs, which are also the two the stall is made of. Exclude the e2e accounts
(epgoodwin+e2e@ / epgoodwin+e2e-fresh@) before reading percentages at
current scale.

### 12. The roster (founder CRM)

`SELECT * FROM user_roster;` — one row per user: signup date, title +
epithet, bottles rated, shift count, event count, last event, narrative
age. SQL-Editor/service-role only (client roles are revoked). This is the
CRM until a real tool earns its place (a named post-launch decision in
CLAUDE.md; the event schema is keyed so any future tool can consume it).

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
