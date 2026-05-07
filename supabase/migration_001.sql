-- Safe migration — run this in Supabase SQL Editor
-- Adds all missing columns and constraints regardless of starting state

-- 1. Make sure the enum type exists
DO $$ BEGIN
  CREATE TYPE application_stage AS ENUM (
    'Applied', 'Phone Screen', 'Technical', 'Onsite', 'Offer', 'Rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create applications table if it doesn't exist at all
CREATE TABLE IF NOT EXISTS applications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Add every column with IF NOT EXISTS so re-running is safe
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS user_id                    uuid REFERENCES auth.users ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS company                    text,
  ADD COLUMN IF NOT EXISTS role                       text DEFAULT 'Unknown Role',
  ADD COLUMN IF NOT EXISTS stage                      application_stage NOT NULL DEFAULT 'Applied',
  ADD COLUMN IF NOT EXISTS notes                      text,
  ADD COLUMN IF NOT EXISTS source_email_id            text,
  ADD COLUMN IF NOT EXISTS last_email_date            timestamptz,
  ADD COLUMN IF NOT EXISTS recruiter_name             text,
  ADD COLUMN IF NOT EXISTS company_domain             text,
  ADD COLUMN IF NOT EXISTS applied_date               timestamptz,
  ADD COLUMN IF NOT EXISTS first_recruiter_call_date  timestamptz,
  ADD COLUMN IF NOT EXISTS interview_count            int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_count                int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw_emails                 jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS company_size               text,
  ADD COLUMN IF NOT EXISTS last_synced_at             timestamptz;

-- 4. Add unique constraint only if it doesn't exist
DO $$ BEGIN
  ALTER TABLE applications
    ADD CONSTRAINT applications_user_domain_unique UNIQUE (user_id, company_domain);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- 5. Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applications_updated_at ON applications;
CREATE TRIGGER applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- 6. Enable RLS
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Drop old permissive policy if it exists, replace with user-scoped one
DROP POLICY IF EXISTS "allow all" ON applications;
DROP POLICY IF EXISTS "applications: own rows" ON applications;
CREATE POLICY "applications: own rows" ON applications
  FOR ALL USING (auth.uid() = user_id);

-- 7. Profiles table (safe to re-run)
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email      text,
  full_name  text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: own row" ON profiles;
CREATE POLICY "profiles: own row" ON profiles
  FOR ALL USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();
