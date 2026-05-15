-- ============================================================
-- Track App — Full Supabase Schema
-- Safe to run on an existing database: uses IF NOT EXISTS
-- and ADD COLUMN IF NOT EXISTS throughout.
-- ============================================================

-- ── 1. Remove any broken new-user trigger ───────────────────
-- This trigger causes "Database error saving new user" for new signups.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ── 2. Enable UUID extension ────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 3. applications ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.applications (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company                  text,
  role                     text,
  stage                    text NOT NULL DEFAULT 'Applied',
  notes                    text,
  company_domain           text,
  recruiter_name           text,
  recruiter_email          text,
  first_recruiter_call_date text,
  last_email_date          timestamptz,
  raw_emails               jsonb,
  industry                 text,
  company_size             text,
  job_url                  text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS company                  text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS role                     text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS stage                    text NOT NULL DEFAULT 'Applied';
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS notes                    text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS company_domain           text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS recruiter_name           text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS recruiter_email          text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS first_recruiter_call_date text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS last_email_date          timestamptz;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS raw_emails               jsonb;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS industry                 text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS company_size             text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS job_url                  text;

-- ── 4. receipts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.receipts (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company           text,
  description       text,
  amount            numeric(10, 2),
  category          text,
  date              date,
  notes             text,
  gmail_message_id  text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS company          text;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS description      text;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS amount           numeric(10, 2);
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS category         text;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS date             date;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS notes            text;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS gmail_message_id text;

-- ── 5. research ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.research (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company         text,
  role            text,
  interview_round text,
  topics          text,
  notes           text,
  status          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.research ADD COLUMN IF NOT EXISTS company         text;
ALTER TABLE public.research ADD COLUMN IF NOT EXISTS role            text;
ALTER TABLE public.research ADD COLUMN IF NOT EXISTS interview_round text;
ALTER TABLE public.research ADD COLUMN IF NOT EXISTS topics          text;
ALTER TABLE public.research ADD COLUMN IF NOT EXISTS notes           text;
ALTER TABLE public.research ADD COLUMN IF NOT EXISTS status          text;

-- ── 6. custom_tables (saved Research Email tables) ──────────
CREATE TABLE IF NOT EXISTS public.custom_tables (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  columns     jsonb NOT NULL DEFAULT '[]',
  rows        jsonb NOT NULL DEFAULT '[]',
  gmail_query text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_tables ADD COLUMN IF NOT EXISTS gmail_query text;
ALTER TABLE public.custom_tables ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

-- ── 7. Row Level Security ────────────────────────────────────
ALTER TABLE public.applications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_tables ENABLE ROW LEVEL SECURITY;

-- applications
DROP POLICY IF EXISTS "applications: own rows only" ON public.applications;
CREATE POLICY "applications: own rows only" ON public.applications
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- receipts
DROP POLICY IF EXISTS "receipts: own rows only" ON public.receipts;
CREATE POLICY "receipts: own rows only" ON public.receipts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- research
DROP POLICY IF EXISTS "research: own rows only" ON public.research;
CREATE POLICY "research: own rows only" ON public.research
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- custom_tables
DROP POLICY IF EXISTS "custom_tables: own rows only" ON public.custom_tables;
CREATE POLICY "custom_tables: own rows only" ON public.custom_tables
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 8. Indexes for common query patterns ────────────────────
CREATE INDEX IF NOT EXISTS idx_applications_user  ON public.applications(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_user      ON public.receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_research_user      ON public.research(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_tables_user ON public.custom_tables(user_id);
