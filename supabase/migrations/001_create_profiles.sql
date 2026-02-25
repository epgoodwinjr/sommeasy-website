-- Wine DNA Profiles table
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Create the profiles table
CREATE TABLE IF NOT EXISTS wine_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  archetype TEXT,
  archetype_emoji TEXT,
  narrative TEXT,
  countries JSONB DEFAULT '[]'::jsonb,
  regions JSONB DEFAULT '{}'::jsonb,
  estates JSONB DEFAULT '{}'::jsonb,
  varietals JSONB DEFAULT '[]'::jsonb,
  specific_wines JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  red_count INTEGER DEFAULT 0,
  white_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE wine_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only read their own profile
CREATE POLICY "Users can view own profile"
  ON wine_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON wine_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON wine_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own profile
CREATE POLICY "Users can delete own profile"
  ON wine_profiles FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wine_profiles_updated_at
  BEFORE UPDATE ON wine_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
