-- 012_house_list.sql — The House List redesign
-- Run this in your Supabase SQL Editor. Additive only: safe to apply before the branch merges.

-- Journal note + where the bottle was drunk (Log a bottle, the wine page)
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS note TEXT
  CHECK (note IS NULL OR char_length(note) <= 500);
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS place TEXT
  CHECK (place IS NULL OR place IN ('home', 'out'));

-- Account › At the table: pre-fills Tonight's terms on Match
-- Shape: { "spend": { "min": 40, "max": 90 }, "color": "all" | "red" | "white" | "sparkling" }
ALTER TABLE wine_profiles ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Which bottle's rating produced a palate event (the wine page's "What it did to your palate").
-- Nullable: events written before this column stay unlinked and simply don't appear there.
ALTER TABLE dna_timeline ADD COLUMN IF NOT EXISTS wine_name TEXT;
