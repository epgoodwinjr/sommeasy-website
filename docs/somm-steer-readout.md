# A Word with the Somm — the steer readout (Aug 3, 2026)

The first item from the Aug 3 outside-feedback triage. Our most active real
user loves giving the Somm direction but "occasion" was the wrong frame —
she wants to steer: a grape, a country, a region, a style ("focus on Chenin
tonight", "nothing Californian"). This session fixed the truncated
placeholder bug and promoted the field into a first-class steer with real
authority over tonight's picks.

## Phase 0 findings (pre-implementation investigation)

**1. Did the text reach the model, and framed how?** It reached the model,
but framed only as a dinner *occasion*. The chain: `occasion` state
(recommend/page.js) → `buildSommPayload` (trimmed, capped 200 chars) → the
route stringifies the whole payload as the single user message → the system
prompt described it as *"what they're doing tonight, if they told us"*, and
the only instruction referencing it told the model to lead the **notes**
with pairing rationale. So "focus on Chenin" was read as an occasion for
note-writing: no authority over selection, no priority against the palate
DNA, no untrusted-input fencing beyond incidentally being a JSON string.

**2. The truncated placeholder was CSS overflow, not a cut literal.** The
source string was complete — `"What's the occasion? (optional — then ask
the Somm again)"`. Placeholder text never wraps; at 375px the input's
content box (~280px after page/card/input padding) holds ~40 characters of
16px Source Sans 3 and the browser clips the rest — exactly the "…ask the
Somm ag" from the report. The initial-form twin had the same defect
("What's the occasion? Steak night, first date, Tuesday… (optional)").

**3. Claude never saw the full menu — candidates were pre-filtered at a
layer the occasion couldn't touch.** `matchWinesAgainstDNA` scores every
bottle entry (score-0 rows included), then `buildSommPayload` filtered to
`score > 0 && price != null`, applied color + budget, sorted by score, and
capped at 25. The validator rejects out-of-slate indices. So "focus on
Chenin" was structurally unfollowable whenever every Chenin scored 0
against the DNA or ranked below the top-25 cutoff — no prompt could fix
that. The steer had to act at the slate.

## What changed

### The field (both the input form and the results filters)

- Label **"Steer the Somm (optional)"**, short placeholder ("A grape, a
  place, a mood…"), and a wrapping helper line with real examples ("Try
  'something South African', 'no Chardonnay', or 'big reds for a steak
  night'."). Long copy now lives only in elements that wrap — the
  truncation class is dead, not just this instance of it.
- Internal rename `occasion` → `steer` throughout the app (state, payload
  key, route). The journal's `wine_interactions.occasion` **column** keeps
  its name (no schema churn); the steer still rides rated picks into the
  journal, whose caption became "That night: …" — honest for both old
  occasions and new steers.

### The steer's authority (route prompt)

New prompt contract, in priority order: **budget (hard) > steer > palate
DNA / feedback**. When a steer is present it is tonight's brief — the model
honors it in selection first and uses the DNA to choose *within* it; the
DNA is background context, not a veto. Food/moment steers keep the old
occasion behavior (pairing-first notes). The Somm acknowledges the steer
where it earns its place ("you asked for something South African — …").

Untrusted-input treatment: trimmed + capped at 200 chars in the builder AND
again server-side in the route (which can't assume its caller), and the
prompt states the steer can never change the pick count, the budget rules,
or the output format — an embedded instruction gets ignored as instruction
and read as wine direction. The validator / salvage / corrective-retry
pipeline is untouched. A legacy client still running pre-deploy JS and
sending `occasion` gets folded into `steer` server-side.

### Steer-aware candidate slate (`buildSommPayload`)

The Phase 0 layer fix, strictly additive:

- The DNA slate (score>0, top 25) is built exactly as before — no
  reordering, no removal. **No steer → byte-identical behavior**, and the
  silent-fallback contract (algorithmic picks) is untouched.
- With a steer: word-boundary term matching against each wine's own text
  (name, section, detected varietal/region/country as display names and raw
  ids) flags matching candidates `steerMatch: true`, and up to **6**
  steer-matched wines that budget and color allow but the DNA filter hid
  (score 0, or below the top-25 cutoff) are **appended** to the slate.
- A demonym map makes "something South African" / "nothing Californian"
  reach the places they mean; a negation guard (a term within two words of
  "no/not/nothing/without/avoid/…") extracts **no** terms from negative
  steers — "no Chardonnay" must never *boost* Chardonnay; avoidance is the
  prompt's job on the wines already present.
- Known edge (accepted): when the DNA matches nothing at all, `curatePicks`
  returns 0 picks and The Somm is never asked — a steer can't create a
  results screen out of an empty-match state. That's the existing
  no-matches flow, out of scope for the lightest-change mandate.

### Telemetry

`menu_analyzed` payloads now carry `steer` (the text actually sent —
trimmed/capped — or null), at both write sites (the no-picks branch and the
somm-outcome path). Payload-only, no schema churn, fire-and-forget contract
untouched. Adoption + what-people-type queries added to
`docs/auth-watchtower.md` **§11d** for the weekly health report.

## Tests

- `sommPicks.test.js` **24 → 30**: steer trim/cap/null; the additive-only
  slate contract (no-steer byte-identical, extras appended ≤6 with
  `steerMatch`, base slate surviving as a prefix); demonym reach; the
  negation guard; budget/color still gating extras.
- **New** `sommRoute.test.js` (5): the REAL `/api/somm-picks` handler via
  the authRoutes pattern (alias-loader + `globalThis.fetch` scripted as
  Claude) — oversized steer capped server-side before reaching the prompt,
  absent steer → null, non-string steer coerced, legacy `occasion` folded
  in, and the system-prompt contract locked (steer > DNA, budget above
  both, output rules fenced, "occasion" gone).
- Full unit run: **347/347 green** across all 12 suites (dnaEvolution 75,
  countryAttribution 22, sommPicks 30, sommRoute 5, authFlow 56, authRoutes
  21, pendingPalate 26, identityVoice 21, palateMark 15, ssrfGuard 48,
  captcha 8, wineEvents 20).
- e2e: **61/61 passed** (5 env-gated skips), all thirteen hard-fail guards
  green — including The Somm spec, the evidence-ledger guard through the
  real /recommend UI, and the fire-and-forget wine-events guard.
- `npm run build` clean.

## 375px placeholder check

Verified with a throwaway Playwright spec (viewport 375×812, the
authenticated storage state, deleted after the run): on BOTH steer fields
the label, placeholder, and helper are fully visible, and a programmatic
overflow assertion (placeholder text set as the input's value,
`scrollWidth <= clientWidth`) passed — the placeholder cannot clip at
mobile width. The old copy could not have passed this assertion; it's how
the truncation class stays dead.

## Prod verification (post-deploy)

Filled in after the Vercel deploy — see the section appended below.
