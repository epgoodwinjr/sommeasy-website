-- Add restaurant context columns to wine_interactions
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS source_label TEXT;
