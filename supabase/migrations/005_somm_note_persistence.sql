-- Somm-note persistence + narrative freshness
-- Run this in your Supabase SQL Editor

-- The Somm's note travels with the rating: when a user rates a current Somm
-- pick, we keep the note, its role (top/value/adventure/splurge/wildcard),
-- and the occasion they told us about. All nullable — ratings made outside
-- somm context simply don't carry them.
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS somm_note TEXT;
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS somm_pick_role TEXT;
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS occasion TEXT;

-- Reserved for the evolving-narrative stretch goal (Palate Act II, Pillar 5):
-- when the narrative was last regenerated. Migrated now so we only touch the
-- schema once.
ALTER TABLE wine_profiles ADD COLUMN IF NOT EXISTS narrative_updated_at TIMESTAMPTZ;
