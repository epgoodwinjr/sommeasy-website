-- Wine Interactions table for Sommeasy
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS wine_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  wine_name TEXT NOT NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('had', 'want', 'skip')),
  rating TEXT CHECK (rating IN ('loved', 'liked', 'fine', 'not_for_me') OR rating IS NULL),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, wine_name)
);

-- Enable RLS
ALTER TABLE wine_interactions ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own interactions
CREATE POLICY "Users can view own interactions" ON wine_interactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own interactions" ON wine_interactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own interactions" ON wine_interactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own interactions" ON wine_interactions
  FOR DELETE USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_wine_interactions_user ON wine_interactions(user_id);
