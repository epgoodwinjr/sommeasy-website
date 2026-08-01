-- The Long Memory (Session, Aug 2026): wine_events — the append-forever
-- usage ledger. State tables say what a palate IS; this table says what the
-- user DID and when. It exists for the launch funnel, durable somm/cost
-- telemetry (Vercel Hobby retains logs ~1 hour), and the longitudinal
-- features Act III deferred (recency, seasons, "your palate a year ago") —
-- none of which are built yet; the substrate is the deliverable.
--
-- The history split (document everywhere): identity history — promotions,
-- demotions, shifts — lives in dna_timeline and is NEVER duplicated here.
-- wine_events records usage: quiz completions, menu analyses, ratings,
-- intent signals, deletions, LLM cost records. The two tables together are
-- the full history.
--
-- occurred_at vs created_at, on purpose: occurred_at is when the moment
-- actually happened, created_at is when the row landed. They differ for
-- exactly one path today — an anonymous quiz completed before signup is
-- back-logged at fold-in time with occurred_at = the stash's createdAt.
--
-- APPEND-FOREVER, FOR EVERYONE INCLUDING TESTS: no UPDATE policy, no DELETE
-- policy — deliberately. The e2e byte-exact-restore discipline EXCLUDES this
-- table: guards assert event deltas (count before/after, latest-row shape),
-- never absolute state, and never delete events. Do not "fix" a guard by
-- adding a DELETE policy here (the migration-008 timeline policy exists for
-- a different table with a different contract).
--
-- No PII in payloads beyond what the wine tables already hold (wine names,
-- ratings, counts, ids). No IP, no user agent, no location. Events describe
-- usage, not users.

CREATE TABLE IF NOT EXISTS wine_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'quiz_completed',        -- mode fresh/refine/restore, dimension counts, composed title
    'menu_analyzed',         -- source scan/url/paste/pdf, wines parsed, match count, somm outcome + duration
    'pick_rated',            -- /recommend pick rating: wine, old→new rating, confidence band
    'bottle_logged',         -- label-scan logging: wine, old→new rating, confidence band
    'rec_rated',             -- WineRecList (home/reveal) rating: wine, old→new rating, confidence band
    'wine_wanted',           -- intent: "Want to try"
    'wine_skipped',          -- intent: "Not for me"
    'journal_rerated',       -- journal rating change (old may be null: first rating from the journal)
    'journal_deleted',       -- what was removed, whether points were reversed
    'narrative_regenerated', -- cost record: tokens + estCostUSD (server-side, palate-narrative)
    'somm_curation'          -- cost record: tokens + estCostUSD + outcome (somm-picks meta)
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE wine_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own events" ON wine_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own events" ON wine_events
  FOR SELECT USING (auth.uid() = user_id);

-- Deliberately NO UPDATE and NO DELETE policies — see header.

CREATE INDEX idx_wine_events_user_occurred ON wine_events(user_id, occurred_at);
