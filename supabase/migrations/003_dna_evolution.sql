-- DNA Evolution Engine tables and columns
-- Run this in your Supabase SQL Editor

-- ═══════════════════════════════════════════════════════
-- 1. Add resolved metadata columns to wine_interactions
-- ═══════════════════════════════════════════════════════

ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS resolved_winery TEXT;
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS resolved_varietal TEXT;
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS resolved_region TEXT;
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS resolved_province TEXT;
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS resolved_country TEXT;
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS match_confidence INTEGER;  -- 0-100
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;


-- ═══════════════════════════════════════════════════════
-- 2. DNA Accumulation table
--    Tracks weighted points per user per dimension
--    from resolved wine interactions
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dna_accumulation (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('varietal', 'estate', 'region', 'country')),
  dimension_value TEXT NOT NULL,   -- e.g., 'syrah', 'henschke', 'barossa', 'australia'
  display_name TEXT NOT NULL,      -- e.g., 'Syrah', 'Henschke', 'Barossa Valley', 'Australia'
  points INTEGER DEFAULT 0,
  interaction_count INTEGER DEFAULT 0,
  promoted BOOLEAN DEFAULT FALSE,
  promoted_at TIMESTAMPTZ,
  demoted_at TIMESTAMPTZ,
  source TEXT DEFAULT 'auto' CHECK (source IN ('auto', 'quiz')),
  mappable BOOLEAN DEFAULT TRUE,   -- false when WineMag value has no wineData.js equivalent
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, dimension, dimension_value)
);

-- Enable RLS
ALTER TABLE dna_accumulation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own accumulation" ON dna_accumulation
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accumulation" ON dna_accumulation
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accumulation" ON dna_accumulation
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own accumulation" ON dna_accumulation
  FOR DELETE USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_dna_accumulation_user ON dna_accumulation(user_id);
CREATE INDEX idx_dna_accumulation_promoted ON dna_accumulation(user_id, promoted) WHERE promoted = TRUE;


-- ═══════════════════════════════════════════════════════
-- 3. DNA Timeline table
--    Records promotion and demotion events for display
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dna_timeline (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('promoted', 'demoted')),
  dimension TEXT NOT NULL CHECK (dimension IN ('varietal', 'estate', 'region', 'country')),
  dimension_value TEXT NOT NULL,
  display_name TEXT NOT NULL,
  event_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE dna_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own timeline" ON dna_timeline
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own timeline" ON dna_timeline
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- No update/delete needed — timeline entries are immutable

-- Index for chronological display
CREATE INDEX idx_dna_timeline_user ON dna_timeline(user_id, event_at DESC);


-- ═══════════════════════════════════════════════════════
-- 4. Reuse the existing updated_at trigger for dna_accumulation
-- ═══════════════════════════════════════════════════════

CREATE TRIGGER dna_accumulation_updated_at
  BEFORE UPDATE ON dna_accumulation
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
