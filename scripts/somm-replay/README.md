# The Somm replay

Sends real payloads through the real `/api/somm-picks` handler and records
what Claude wrote and what the route made of it. It exists because the ledger
could say the Somm fell back, but only the replies could say why (Nov 2026:
every fallback was an ask the list couldn't supply).

**It is not a test.** Nothing runs it: not the unit suites
(`src/lib/__tests__/`), not Playwright (`e2e/`), not the build. Run it by hand
when the Somm's prompt, validator, clamp, model or request parameters change,
and compare against a baseline.

## What a run costs

Every run is at least one paid Claude call, two when the corrective retry
fires.

| | Runs | Calls | Cost (Nov 12, 2026, `claude-sonnet-4-6`) |
|---|---|---|---|
| The full replay, 27 cases × 5 | 135 | ~145 | **about $1.90**, 5–7 minutes |
| The six lone-Adventure cases × 5 | 30 | 30 | $0.25, about a minute (Nov 13, 2026) |
| The six budget cases × 30 | 180 | 180–207 | $2.12 on today's route ($3.13 before Nov 13's fix), 6–8 minutes |
| The retry probe, 27 rejected replies × 2 | 54 | 54 | about $1.05, 2 minutes |
| One case × 5 | 5 | 5–10 | $0.04–$0.13 |
| One one-wine case, one run | 1 | 1 | ~$0.007 |
| `--dry` | 0 | 0 | free |

The lone Adventure's cases (`adventure …`, Nov 13, 2026) replay the page's
OTHER question: a list that matched nothing, the Somm asked for exactly one
wine (`mode: "adventure"`, built by `buildAdventurePayload` as MatchList.js
builds it). They cost about $0.008 a run. Read their replies in
`results/<tag>.full.json` — the outcome says the answer was valid, only the
note says whether it was honest about the stretch.

A run costs $0.007 (one wine) to $0.026 (a 40-bottle list with a retry);
$0.016 on average. `replay.mjs` prints its estimate before it starts and what
it spent when it ends.

## What it touches

- **The Anthropic API, and nothing else on the network.** No Supabase client
  is created. It never signs in, never reads or writes the test account (or
  any account), and writes no `wine_events` row: the route has no session,
  and the event is the page's to write.
- The palate it uses is a **frozen copy** of the e2e account's profile
  (`cases.mjs`, Nov 12, 2026), plus a made-up broader one.
- It reads `ANTHROPIC_API_KEY` (and `ANTHROPIC_MODEL`, if set) from the
  environment or `.env.local`, and prints neither.
- It writes only to `scripts/somm-replay/results/` (gitignored): the results,
  and a copy of the pre-Oct-30 match engine read out of git for one case.
- It sets `E2E_DISABLE_RATE_LIMIT=1` for its own process — the limiter's
  switch for plain-node harnesses.

## Running it

```bash
node scripts/somm-replay/replay.mjs --dry
```

```bash
node scripts/somm-replay/replay.mjs
```

```bash
node scripts/somm-replay/replay.mjs --runs 1 --only "e2e_2wine,example" --tag my-change
```

```bash
node scripts/somm-replay/compare.mjs scripts/somm-replay/baselines/2026-11-12-after.json scripts/somm-replay/results/my-change.json
```

Options: `--runs N` (default 5), `--only "label,label"` (labels as `--dry`
prints them), `--tag name` (the result file's name), `--concurrency N`
(default 6).

Each replay writes `results/<tag>.json` (compact, what `compare.mjs` reads)
and `results/<tag>.full.json` (every reply, word for word — read these when
an outcome surprises you).

A long replay started as a background task may crawl; run it in a terminal.

**Five runs are a rumor, thirty are a rate.** The Nov 12 budget baseline
(six cases × 5) showed one fallback in 30 runs. At 30 runs a case, one of
those cases fell back 9 times in 30. Use `--runs 30` on the cases a change
is about before quoting a rate.

## The retry probe

A replay shows how often the first reply is rejected. `retry-probe.mjs`
shows what the route's corrective message does about it: it hands a recorded
rejected reply back to the real route as its first answer (no API call for
that one) and lets the route send its real retry to the real API. One paid
call a run, and every run exercises the retry.

```bash
node scripts/somm-replay/retry-probe.mjs --from my-change
```

```bash
node scripts/somm-replay/retry-probe.mjs --from my-change --save
```

```bash
node scripts/somm-replay/retry-probe.mjs --set scripts/somm-replay/baselines/2026-11-13-rejected.json --reps 2 --tag my-retry
```

`--from <tag>` lists the rejected first replies in `results/<tag>.full.json`
(free). `--save` keeps them beside the payloads they answered
(`results/<tag>.rejected.json`) — save BEFORE changing the payload builder:
a reply's indices mean nothing against a different slate. `--set <file>`
replays a saved set; each run's `sent` in the `.full.json` is the corrective
message as the route wrote it.

`baselines/2026-11-13-rejected.json` is such a set: 27 replies with two
picks over the max, against Nov 13's 25-candidate budget payloads. Replay it
when the retry's wording, the validator's reasons or the model change.

## Reading the result

| Outcome | Meaning |
|---|---|
| `first_attempt` | One call, accepted as written |
| `salvaged` | One call, repaired (a clipped note, a relabeled splurge, an answer read after prose) |
| `retried` | The first reply was rejected; the corrective retry was accepted |
| `fallback` | Both replies rejected, or an upstream error — the page keeps the engine's picks |
| `silent` | The route never asked Claude (nothing legal to ask for) |

`reasons` are the route's own, one per rejected attempt, in order.

## The cases

`cases.mjs` builds each payload with the real `matchEngine.js` and
`buildSommPayload`, the way `MatchList.js` does: the e2e lists, the app's
example list, a realistic 40-bottle list with and without Tonight's terms,
the sample PDF as Vision delivers it, the 7-wine list as the pre-Oct-30
engine scored it, two budgets that leave one wine and none (the terms rule),
and six unpriced candidates under a budget (a payload the page can't build —
it is there because the route can't assume its caller).

To add a case, add a list and a line in `CASES`. To probe a change before
touching the route — a request parameter, say — amend the outgoing body in
`runner.mjs`'s fetch wrapper; the handler still runs as it is.

## Baselines

- `baselines/2026-11-12-before.json` — the 90 runs of the diagnosis, on the
  route as it shipped: 35 fallbacks, slowest 62s.
- `baselines/2026-11-12-after.json` — the same 90 on the fixed route: 0
  fallbacks, slowest 20s.
- `baselines/2026-11-12-terms-rule.json` — the six budget cases (five runs
  each) once the engine's picks obeyed Tonight's terms: the page and the
  Somm now count the same picks. "Red, up to $80" went from retried 9 of 10
  to none of 10 retried on the narrow palate and 2 of 5 on the broad one
  (the engine's hint no longer lists over-budget picks); one "up to $50"
  run fell back — the model kept two over-budget wines through the retry.
- `baselines/2026-11-12-unpriced-before.json` / `-after.json` — six unpriced
  candidates under a budget, five runs each: `silent` five times while the
  clamp counted only priced wines, `first_attempt` five times once it agreed
  with the validator.

- `baselines/2026-11-13-budget-before.json` / `-after.json` — the six budget
  cases, 30 runs each, on main's route and on the `loose-ends` one (few
  stretch wines in the slate, each marked `overMax`, a retry that names every
  pick over the max): one call 153 → 180 of 180, retried 18 → 0, fallback
  9 → 0 (all nine on "up to $60"), slowest 24.2s → 15.7s, $3.13 → $2.12.
- `baselines/2026-11-13-budget-three-unmarked.json` / `-one-unmarked.json` —
  the same 180 with three stretch wines and with one, neither marked: three
  were rejected on the first reply 39 times (the retry recovered all 39);
  one, never — but the Somm has no choice of stretch.
- `baselines/2026-11-13-retry-before.json` / `-after.json` — the retry probe
  on `2026-11-13-rejected.json`, twice each: the old corrective message
  recovered 27 of 54, the one that names every over-max pick 54 of 54.

A new baseline is a compact result file copied here under its date.
