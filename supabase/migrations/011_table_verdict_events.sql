-- The Table Verdict (Aug 2026): two new wine_events types closing the loop
-- on Somm picks — from our most active real user: "need to be able to log if
-- you selected one of the recommended wines... as well as something like
-- 'went with a different option'".
--
--   pick_chosen   — "this one's on the table": the diner declared the
--                   ordered wine. INTENT, never DNA evidence (standing
--                   decision: DNA is tasted-evidence-only; rating remains
--                   the only gate). Payload: wine, role, price, steer,
--                   session (client-minted analysis-session id), replaced
--                   (the previously chosen wine when the table changed its
--                   mind — append-only, latest declaration wins).
--   somm_bypassed — the table went a different way tonight. Session-level.
--                   Payload: session, steer, picks_shown, had_chosen (a
--                   choice this bypass superseded).
--
-- With these, a curation session resolves to chosen(+rated) / chosen
-- (unrated) / bypassed / silent — see docs/auth-watchtower.md §11e for the
-- conversion funnel. menu_analyzed's somm.outcome stays what it always was
-- (the CURATION outcome, minutes after analysis); the diner verdict is a
-- different dimension and arrives hours later.
--
-- The append-forever contract is UNTOUCHED: this migration amends only the
-- type CHECK. Still no UPDATE policy, no DELETE policy, for anyone
-- including tests — guards assert deltas, never absolute state.

ALTER TABLE wine_events DROP CONSTRAINT wine_events_event_type_check;
ALTER TABLE wine_events ADD CONSTRAINT wine_events_event_type_check CHECK (event_type IN (
  'quiz_completed',        -- mode fresh/refine/restore, dimension counts, composed title
  'menu_analyzed',         -- source scan/url/paste/pdf, wines parsed, match count, somm outcome + duration
  'pick_rated',            -- Somm-pick rating (surface recommend/verdict_prompt): wine, old→new rating, confidence band
  'bottle_logged',         -- label-scan logging: wine, old→new rating, confidence band
  'rec_rated',             -- WineRecList (home/reveal) rating: wine, old→new rating, confidence band
  'wine_wanted',           -- intent: "Want to try"
  'wine_skipped',          -- intent: "Not for me"
  'journal_rerated',       -- journal rating change (old may be null: first rating from the journal)
  'journal_deleted',       -- what was removed, whether points were reversed
  'narrative_regenerated', -- cost record: tokens + estCostUSD (server-side, palate-narrative)
  'somm_curation',         -- cost record: tokens + estCostUSD + outcome (somm-picks meta)
  'pick_chosen',           -- Table Verdict: "this one's on the table" — intent, never DNA evidence
  'somm_bypassed'          -- Table Verdict: the table went a different way tonight
));
