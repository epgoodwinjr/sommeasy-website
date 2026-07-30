-- Act III groundwork (Session 1: The Evidence Ledger)
-- Run this in your Supabase SQL Editor
--
-- 1. wine_profiles.identity — the per-user identity strand (epithet, traits,
--    visual genome). Empty for now; Session 2 ("One of One") populates it.
-- 2. dna_timeline.event_type gains 'shifted' — Session 3 writes a shifted
--    event when a milestone recompose changes the title or epithet.

ALTER TABLE wine_profiles ADD COLUMN IF NOT EXISTS identity JSONB;

ALTER TABLE dna_timeline DROP CONSTRAINT dna_timeline_event_type_check;
ALTER TABLE dna_timeline ADD CONSTRAINT dna_timeline_event_type_check
  CHECK (event_type IN ('promoted', 'demoted', 'shifted'));
